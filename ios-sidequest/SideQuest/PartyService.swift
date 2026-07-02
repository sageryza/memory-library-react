import SwiftUI
import FirebaseAuth
import FirebaseFirestore

struct PartyMember: Identifiable, Equatable {
    let uid: String
    let username: String
    let avatar: String
    var id: String { uid }
}

struct Party: Identifiable, Equatable {
    let id: String
    let cityName: String
    let questId: Int
    let memberIds: [String]
    let members: [PartyMember]
    let status: String          // "active" | "completed"
    let createdAt: Double
    var quest: Quest { Quests.partyQuest(questId) }
}

struct ChatMessage: Identifiable, Equatable {
    let id: String
    let byUid: String
    let username: String
    let avatar: String
    let text: String
    let ts: Double
}

/// City-based matchmaking + party chat, all on Firestore (no server):
/// `sidequestQueue/{uid}` is one doc per hero waiting in a city; whoever
/// arrives and finds waiters claims up to 3 of them in a transaction,
/// creates `sidequestParties/{id}` with a random co-op quest, and stamps
/// each claimed queue doc with the partyId — the waiters' own-doc listeners
/// see it and jump into the party. Chat is a `messages` subcollection.
@MainActor
final class PartyService: ObservableObject {
    enum Phase: Equatable { case idle, searching, matched }

    @Published var phase: Phase = .idle
    @Published var party: Party?
    @Published var messages: [ChatMessage] = []
    @Published var waitingNearby = 0    // other heroes queued in the watched city
    @Published var error: String?

    private lazy var db = Firestore.firestore()
    private var queueListener: ListenerRegistration?
    private var countListener: ListenerRegistration?
    private var partyListener: ListenerRegistration?
    private var msgListener: ListenerRegistration?

    private var queueCol: CollectionReference { db.collection("sidequestQueue") }
    private var partyCol: CollectionReference { db.collection("sidequestParties") }
    private let partyKey = "sidequest.party.id"
    private static let staleAfter: Double = 1800   // ignore queue docs older than 30 min

    var uid: String? { Auth.auth().currentUser?.uid }

    /// "Portland " / "pórtland" → one matchmaking key.
    nonisolated static func cityKey(_ name: String) -> String {
        name.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil)
            .trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private var authHandle: AuthStateDidChangeListenerHandle?

    /// Re-attach to a party that survived an app restart. Waits for the
    /// anonymous sign-in (kicked off by FeedService at launch) so the party
    /// listener doesn't fire a permission error before auth is ready.
    func restore() {
        guard let id = UserDefaults.standard.string(forKey: partyKey), !id.isEmpty else { return }
        if Auth.auth().currentUser != nil { attachParty(id); return }
        authHandle = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            guard let self, user != nil else { return }
            if let h = self.authHandle { Auth.auth().removeStateDidChangeListener(h); self.authHandle = nil }
            self.attachParty(id)
        }
    }

    /// Live count of heroes waiting in a city (shown before + during search).
    func watchCity(_ name: String) {
        countListener?.remove(); countListener = nil
        let key = Self.cityKey(name)
        guard !key.isEmpty else { waitingNearby = 0; return }
        countListener = queueCol.whereField("cityKey", isEqualTo: key)
            .addSnapshotListener { [weak self] snap, _ in
                guard let self, let snap else { return }
                self.waitingNearby = snap.documents.filter { self.isWaiting($0) }.count
            }
    }

    private func isWaiting(_ doc: QueryDocumentSnapshot) -> Bool {
        let d = doc.data()
        guard doc.documentID != uid, d["partyId"] == nil else { return false }
        let ts = (d["ts"] as? Timestamp)?.dateValue().timeIntervalSince1970
            ?? Date().timeIntervalSince1970   // pending server timestamp = fresh
        return Date().timeIntervalSince1970 - ts < Self.staleAfter
    }

    // MARK: matchmaking

    func findPartner(city: String, username: String, avatar: String, excluding blocked: Set<String> = []) {
        guard phase != .matched else { return }
        error = nil
        Task {
            do {
                if Auth.auth().currentUser == nil { try await Auth.auth().signInAnonymously() }
                guard let uid = self.uid else { return }
                let key = Self.cityKey(city)

                // Matched while the app was closed? Rejoin instead of re-queueing.
                if let mine = try? await queueCol.document(uid).getDocument(source: .server),
                   let pid = mine.data()?["partyId"] as? String {
                    queueCol.document(uid).delete()
                    if let p = try? await partyCol.document(pid).getDocument(source: .server),
                       p.data()?["status"] as? String == "active" {
                        attachParty(pid)
                        return
                    }
                }

                // Anyone already waiting here? Claim up to 3 (party of 4 max).
                let snap = try await queueCol.whereField("cityKey", isEqualTo: key)
                    .limit(to: 25).getDocuments(source: .server)
                let waiting = snap.documents.filter { self.isWaiting($0) && !blocked.contains($0.documentID) }
                    .sorted {
                        (($0.data()["ts"] as? Timestamp)?.seconds ?? .max)
                            < (($1.data()["ts"] as? Timestamp)?.seconds ?? .max)
                    }
                    .prefix(3)

                if !waiting.isEmpty,
                   let id = try await claim(Array(waiting), city: city, uid: uid,
                                            username: username, avatar: avatar) {
                    attachParty(id)
                    return
                }

                // Nobody here (or they got claimed first) — get in line and wait.
                try await queueCol.document(uid).setData([
                    "cityKey": key, "cityName": city,
                    "username": String(username.prefix(20)), "avatar": avatar,
                    "ts": FieldValue.serverTimestamp(),
                ])
                phase = .searching
                watchOwnQueueDoc()
                watchCity(city)
            } catch {
                self.error = "The matchmaking spirits are unreachable. Try again."
                print("SideQuest party: \(error)")
            }
        }
    }

    /// Transactionally claim still-unmatched waiters and create the party.
    private func claim(_ candidates: [QueryDocumentSnapshot], city: String,
                       uid: String, username: String, avatar: String) async throws -> String? {
        let partyRef = partyCol.document()
        let questId = Quests.partyPool.randomElement()!.id
        let cityKey = Self.cityKey(city)
        let result = try await db.runTransaction { txn, _ -> Any? in
            var members: [[String: Any]] = [["uid": uid, "username": username, "avatar": avatar]]
            var ids = [uid]
            var claimed: [DocumentReference] = []
            for c in candidates {
                guard let fresh = try? txn.getDocument(c.reference), fresh.exists,
                      fresh.data()?["partyId"] == nil else { continue }
                let d = fresh.data() ?? [:]
                members.append(["uid": c.documentID,
                                "username": d["username"] as? String ?? "npc",
                                "avatar": d["avatar"] as? String ?? "🧙‍♂️"])
                ids.append(c.documentID)
                claimed.append(c.reference)
            }
            guard ids.count >= 2 else { return nil }   // everyone got claimed first
            txn.setData([
                "cityName": city, "cityKey": cityKey,
                "questId": questId,
                "memberIds": ids, "members": members,
                "createdBy": uid,   // the matcher — push functions skip them
                "status": "active",
                "createdAt": FieldValue.serverTimestamp(),
            ], forDocument: partyRef)
            for r in claimed { txn.updateData(["partyId": partyRef.documentID], forDocument: r) }
            return partyRef.documentID
        }
        return result as? String
    }

    /// While queued, watch my own queue doc for a matcher stamping a partyId.
    private func watchOwnQueueDoc() {
        guard let uid else { return }
        queueListener?.remove()
        queueListener = queueCol.document(uid).addSnapshotListener { [weak self] snap, _ in
            guard let self, let pid = snap?.data()?["partyId"] as? String else { return }
            self.queueCol.document(uid).delete()
            self.attachParty(pid)
        }
    }

    func cancelSearch() {
        if let uid { queueCol.document(uid).delete() }
        queueListener?.remove(); queueListener = nil
        phase = .idle
    }

    // MARK: party + chat

    private func attachParty(_ id: String) {
        UserDefaults.standard.set(id, forKey: partyKey)
        queueListener?.remove(); queueListener = nil
        countListener?.remove(); countListener = nil
        partyListener?.remove(); msgListener?.remove()
        phase = .matched

        partyListener = partyCol.document(id).addSnapshotListener { [weak self] snap, _ in
            guard let self, let snap else { return }   // transient error — keep the party
            guard snap.exists, let d = snap.data() else { self.leaveParty(); return }
            let members = (d["members"] as? [[String: Any]] ?? []).map {
                PartyMember(uid: $0["uid"] as? String ?? "",
                            username: $0["username"] as? String ?? "npc",
                            avatar: $0["avatar"] as? String ?? "🧙‍♂️")
            }
            self.party = Party(
                id: id,
                cityName: d["cityName"] as? String ?? "",
                questId: d["questId"] as? Int ?? Quests.partyPool[0].id,
                memberIds: d["memberIds"] as? [String] ?? [],
                members: members,
                status: d["status"] as? String ?? "active",
                createdAt: (d["createdAt"] as? Timestamp)?.dateValue().timeIntervalSince1970 ?? 0)
        }

        msgListener = partyCol.document(id).collection("messages")
            .order(by: "ts").limit(to: 200)
            .addSnapshotListener { [weak self] snap, _ in
                guard let self, let snap else { return }
                self.messages = snap.documents.map { doc in
                    let d = doc.data()
                    return ChatMessage(
                        id: doc.documentID,
                        byUid: d["byUid"] as? String ?? "",
                        username: d["username"] as? String ?? "npc",
                        avatar: d["avatar"] as? String ?? "🧙‍♂️",
                        text: d["text"] as? String ?? "",
                        ts: (d["ts"] as? Timestamp)?.dateValue().timeIntervalSince1970 ?? 0)
                }
            }
    }

    func send(_ text: String, username: String, avatar: String) {
        guard let uid, let party else { return }
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return }
        partyCol.document(party.id).collection("messages").addDocument(data: [
            "byUid": uid,
            "username": String(username.prefix(20)), "avatar": avatar,
            "text": String(t.prefix(500)),
            "ts": FieldValue.serverTimestamp(),
        ])
    }

    /// Mark the shared quest done (any member can; everyone sees the victory).
    func markCompleted() {
        guard let uid, let party else { return }
        partyCol.document(party.id).updateData([
            "status": "completed",
            "completedBy": FieldValue.arrayUnion([uid]),
        ])
    }

    /// Local leave — drop back to matchmaking; the party doc stays for others.
    func leaveParty() {
        UserDefaults.standard.removeObject(forKey: partyKey)
        partyListener?.remove(); partyListener = nil
        msgListener?.remove(); msgListener = nil
        party = nil
        messages = []
        phase = .idle
    }
}
