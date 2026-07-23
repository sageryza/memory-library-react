import Foundation
import FirebaseAuth
import FirebaseFirestore

// Data layer for XI Versus — a faithful Swift port of src/hooks/useVersusGame.js.
// Same `versusGames/{id}` doc shape, same transactions, so web ↔ iOS players
// share games. Game logic lives in VersusModel; this persists/loads it.

struct VersusPlayer: Identifiable, Equatable {
    let uid: String, name: String, color: String
    let order: Int
    var id: String { uid }
}

struct VersusStory: Identifiable, Equatable {
    let id: String, byUid: String, byName: String, color: String, pairKey: String
    let eventCap: String, twistCap: String, text: String
    let ts: Double
}

struct VersusGameState: Equatable {
    let id: String
    let players: [VersusPlayer]
    let round: Int
    let acted: [String]
    let placedBy: [String]
    let placed: [VersusPlaced]
    let drawPileCount: Int
    let stats: [String: [String: Int]]
    /// "waiting" until everyone's in; "active" once live.
    /// Legacy docs without the field decode as "active".
    let status: String
    let createdBy: String
    /// How many players the creator set up the game for — the game starts
    /// automatically, for everyone at once, the moment this many have joined.
    let expectedPlayers: Int
    let invites: [VersusInvite]

    var isWaiting: Bool { status == "waiting" }
}

/// A tracked invite seat: a unique link token, the contact's name if one was
/// picked, and who claimed it.
struct VersusInvite: Equatable {
    let token: String
    let name: String
    let claimedBy: String?
}

@MainActor
final class VersusService {
    static let shared = VersusService()
    static let handSize = 5
    private lazy var db = Firestore.firestore()

    private func gameRef(_ id: String) -> DocumentReference { db.collection("versusGames").document(id) }
    private func handRef(_ id: String, _ uid: String) -> DocumentReference { gameRef(id).collection("hands").document(uid) }
    private var uid: String? { Auth.auth().currentUser?.uid }

    private func e(_ m: String) -> NSError { NSError(domain: "Versus", code: 1, userInfo: [NSLocalizedDescriptionKey: m]) }

    private func currentName() -> String {
        if let u = Auth.auth().currentUser {
            if let dn = u.displayName, !dn.isEmpty { return ContentFilter.masked(dn) }
            if let em = u.email, let p = em.split(separator: "@").first { return ContentFilter.masked(String(p)) }
            // Anonymous users get a distinguishable handle instead of everyone
            // collapsing to the same bare "Player".
            return "Player " + String(u.uid.suffix(4))
        }
        return "Player"
    }

    private static let idChars = Array("abcdefghijkmnpqrstuvwxyz23456789")
    private func generateId() -> String { String((0..<8).map { _ in Self.idChars.randomElement()! }) }

    // MARK: Create / join

    /// invites: one entry per tracked seat (unique link token + optional contact
    /// name). expectedPlayers counts the creator. The game starts AUTOMATICALLY,
    /// for everyone at the same instant, when that many players have joined.
    func createGame(expectedPlayers: Int = 2,
                    invites: [(token: String, name: String)] = []) async throws -> String {
        guard let uid = uid else { throw e("Sign in to start a Versus game.") }
        let id = generateId()
        // The deck honors the creator's Curate removals + deck toggles (a
        // curated game for everyone in it), falling back to the full pools when
        // too few cards remain to seed and draw — matching the web.
        let beAll = CurateStore.shared.allowedEvents
        let bwAll = CurateStore.shared.allowedTwists
        let seeded = VersusModel.seedBoard(
            eventPool: beAll.count >= 6 ? beAll : CurateStore.liveIndices(XIDeck.events),
            twistPool: bwAll.count >= 6 ? bwAll : CurateStore.liveIndices(XIDeck.twists))
        let creator: [String: Any] = ["uid": uid, "name": currentName(), "color": VersusModel.playerColors[0], "order": 0]
        try await gameRef(id).setData([
            "createdBy": uid,
            "createdAt": FieldValue.serverTimestamp(),
            "updatedAt": FieldValue.serverTimestamp(),
            // Games open in a waiting room: nobody can play until everyone has
            // joined — then it goes live for all players at once. No head starts.
            "status": "waiting",
            "expectedPlayers": max(2, expectedPlayers),
            "invites": invites.map { ["token": $0.token, "name": $0.name] },
            "players": [creator],
            "round": 0,
            "acted": [String](),
            "placedBy": [String](),
            "placed": seeded.placed.map(encodePlaced),
            "drawPile": seeded.drawPile.map { ["d": $0.d, "i": $0.i] },
            "stats": [uid: ["placed": 0, "stories": 0]],
        ])
        return id
    }

    func joinGame(_ gameId: String, inviteToken: String? = nil) async throws {
        guard let uid = uid else { throw e("Sign in to join.") }
        let name = currentName()
        // Transactional: two players joining at the same moment must not clobber
        // each other's entry or compute the same order.
        _ = try await db.runTransaction { txn, errPtr -> Any? in
            guard let gSnap = self.txnGet(txn, self.gameRef(gameId), errPtr), let g = gSnap.data() else {
                errPtr?.pointee = self.e("Game not found."); return nil
            }
            let players = (g["players"] as? [[String: Any]]) ?? []
            if players.contains(where: { ($0["uid"] as? String) == uid }) { return nil }
            // A started game is locked to its players — joining is only open
            // while the game is in its waiting room. (Legacy docs without a
            // status count as started.)
            guard (g["status"] as? String ?? "active") == "waiting" else {
                errPtr?.pointee = self.e("This game has already started — it's locked to its players."); return nil
            }
            let order = players.count
            let player: [String: Any] = [
                "uid": uid, "name": name,
                "color": VersusModel.playerColors[order % VersusModel.playerColors.count], "order": order,
            ]
            var update: [String: Any] = [
                "players": players + [player],
                "stats.\(uid)": ["placed": 0, "stories": 0],
                "updatedAt": FieldValue.serverTimestamp(),
            ]
            // Tracked invite: mark this seat claimed so the waiting room can
            // show exactly who's in.
            if let token = inviteToken, !token.isEmpty {
                var invites = (g["invites"] as? [[String: Any]]) ?? []
                if let i = invites.firstIndex(where: { ($0["token"] as? String) == token && $0["claimedBy"] == nil }) {
                    invites[i]["claimedBy"] = uid
                    update["invites"] = invites
                }
            }
            // Roster complete → the game begins for everyone at this instant.
            let expected = max(2, g["expectedPlayers"] as? Int ?? 2)
            if players.count + 1 >= expected {
                update["status"] = "active"
            }
            txn.updateData(update, forDocument: self.gameRef(gameId))
            return nil
        }
    }

    /// The other players' names in a game (everyone but you), for the lobby list.
    /// nil if no one else has joined yet.
    func otherPlayerNames(gameId: String) async -> String? {
        guard let snap = try? await gameRef(gameId).getDocument(), let g = snap.data() else { return nil }
        let players = (g["players"] as? [[String: Any]]) ?? []
        let mine = uid
        let others = players.compactMap { p -> String? in
            guard let puid = p["uid"] as? String, puid != mine else { return nil }
            let n = (p["name"] as? String)?.trimmingCharacters(in: .whitespaces)
            return (n?.isEmpty == false) ? n : nil
        }
        return others.isEmpty ? nil : others.joined(separator: ", ")
    }

    /// Whether the game document still exists — used to prune dead games from the
    /// lobby's recents. A network error reads as "exists" so we never prune a
    /// live game just because the fetch failed.
    func gameExists(_ gameId: String) async -> Bool {
        guard let snap = try? await gameRef(gameId).getDocument() else { return true }
        return snap.exists
    }

    /// Lobby summary for sorting "your games": whether it's YOUR turn, and how
    /// recently the game moved. nil if the doc is gone (prune it).
    struct GameSummary {
        let others: String?
        let yourTurn: Bool
        let updatedAt: Double
        let waiting: Bool
    }

    func gameSummary(_ gameId: String) async -> GameSummary?? {
        guard let snap = try? await gameRef(gameId).getDocument() else { return nil }   // network error: unknown
        guard snap.exists, let g = snap.data() else { return .some(nil) }               // gone: prune
        let mine = uid
        let players = (g["players"] as? [[String: Any]]) ?? []
        let others = players.compactMap { p -> String? in
            guard let puid = p["uid"] as? String, puid != mine else { return nil }
            let n = (p["name"] as? String)?.trimmingCharacters(in: .whitespaces)
            return (n?.isEmpty == false) ? n : nil
        }
        let status = g["status"] as? String ?? "active"
        let acted = (g["acted"] as? [String]) ?? []
        let yourTurn: Bool = {
            guard status == "active", let me = mine else { return false }
            let isPlayer = players.contains { ($0["uid"] as? String) == me }
            return isPlayer && !acted.contains(me)
        }()
        let updated = (g["updatedAt"] as? Timestamp)?.dateValue().timeIntervalSince1970 ?? 0
        return .some(GameSummary(others: others.isEmpty ? nil : others.joined(separator: ", "),
                                 yourTurn: yourTurn, updatedAt: updated, waiting: status == "waiting"))
    }

    // MARK: Hand

    func ensureHand(_ gameId: String) async throws {
        guard let uid = uid else { return }
        _ = try await db.runTransaction { txn, errPtr -> Any? in
            guard let gSnap = self.txnGet(txn, self.gameRef(gameId), errPtr), gSnap.exists else { return nil }
            let hSnap = self.txnGet(txn, self.handRef(gameId, uid), errPtr)
            var cards = ((hSnap?.data()?["cards"] as? [[String: Any]]) ?? [])
            if cards.count >= Self.handSize { return nil }
            let pile = (gSnap.data()?["drawPile"] as? [[String: Any]]) ?? []
            let take = Array(pile.prefix(Self.handSize - cards.count))
            if take.isEmpty && (hSnap?.exists ?? false) { return nil }
            cards.append(contentsOf: take)
            txn.updateData(["drawPile": Array(pile.dropFirst(take.count)), "updatedAt": FieldValue.serverTimestamp()], forDocument: self.gameRef(gameId))
            txn.setData(["cards": cards], forDocument: self.handRef(gameId, uid))
            return nil
        }
    }

    // MARK: Place / undo / skip

    func placeCard(_ gameId: String, card: HandCard, r: Int, c: Int) async throws {
        guard let uid = uid else { throw e("Sign in to play.") }
        _ = try await db.runTransaction { txn, errPtr -> Any? in
            guard let gSnap = self.txnGet(txn, self.gameRef(gameId), errPtr), let g = gSnap.data() else {
                errPtr?.pointee = self.e("Game not found."); return nil
            }
            let players = (g["players"] as? [[String: Any]]) ?? []
            guard players.contains(where: { ($0["uid"] as? String) == uid }) else { errPtr?.pointee = self.e("Join the game first."); return nil }
            guard (g["status"] as? String ?? "active") != "waiting" else {
                errPtr?.pointee = self.e("The game hasn't started yet."); return nil
            }
            if ((g["acted"] as? [String]) ?? []).contains(uid) { errPtr?.pointee = self.e("You've already gone this round."); return nil }
            let placedBy = (g["placedBy"] as? [String]) ?? []
            if placedBy.contains(uid) { errPtr?.pointee = self.e("You've already placed — write its story to finish."); return nil }
            let placedRaw = (g["placed"] as? [[String: Any]]) ?? []
            guard VersusModel.canPlace(placedRaw.compactMap(self.decodePlaced), r, c, card) else { errPtr?.pointee = self.e("That spot isn't legal."); return nil }

            guard let hSnap = self.txnGet(txn, self.handRef(gameId, uid), errPtr) else { return nil }
            var cards = ((hSnap.data()?["cards"] as? [[String: Any]]) ?? []).compactMap(self.decodeCard)
            guard let idx = cards.firstIndex(where: { $0.d == card.d && $0.i == card.i }) else { errPtr?.pointee = self.e("That card isn't in your hand."); return nil }

            let color = players.first { ($0["uid"] as? String) == uid }?["color"] as? String
            let newPlaced = placedRaw + [["r": r, "c": c, "d": card.d, "i": card.i, "by": uid, "color": color ?? NSNull()]]

            var pile = (g["drawPile"] as? [[String: Any]]) ?? []
            let draw = Array(pile.prefix(1)); pile = Array(pile.dropFirst(draw.count))
            cards.remove(at: idx)
            let newHand = cards.map { ["d": $0.d, "i": $0.i] } + draw

            var stats = (g["stats"] as? [String: [String: Any]]) ?? [:]
            let mine = stats[uid] ?? [:]
            stats[uid] = ["placed": ((mine["placed"] as? Int) ?? 0) + 1, "stories": (mine["stories"] as? Int) ?? 0]

            txn.updateData([
                "placed": newPlaced, "drawPile": pile, "stats": stats,
                "placedBy": placedBy + [uid], "updatedAt": FieldValue.serverTimestamp(),
            ], forDocument: self.gameRef(gameId))
            txn.setData(["cards": newHand], forDocument: self.handRef(gameId, uid))
            return nil
        }
    }

    func undoLastMove(_ gameId: String) async throws {
        guard let uid = uid else { throw e("Sign in first.") }
        _ = try await db.runTransaction { txn, errPtr -> Any? in
            guard let gSnap = self.txnGet(txn, self.gameRef(gameId), errPtr), let g = gSnap.data() else {
                errPtr?.pointee = self.e("Game not found."); return nil
            }
            guard (g["status"] as? String ?? "active") != "waiting" else {
                errPtr?.pointee = self.e("The game hasn't started yet."); return nil
            }
            var placedRaw = (g["placed"] as? [[String: Any]]) ?? []
            guard let last = placedRaw.last, (last["by"] as? String) == uid else { errPtr?.pointee = self.e("Nothing of yours to undo."); return nil }

            let hSnap = self.txnGet(txn, self.handRef(gameId, uid), errPtr)
            var cards = ((hSnap?.data()?["cards"] as? [[String: Any]]) ?? []).compactMap(self.decodeCard)
            let card = HandCard(d: last["d"] as? String ?? "be", i: last["i"] as? Int ?? 0)
            var pile = (g["drawPile"] as? [[String: Any]]) ?? []
            if cards.count < Self.handSize { cards.append(card) } else { pile = [["d": card.d, "i": card.i]] + pile }

            var stats = (g["stats"] as? [String: [String: Any]]) ?? [:]
            let mine = stats[uid] ?? [:]
            stats[uid] = ["placed": max(0, ((mine["placed"] as? Int) ?? 0) - 1), "stories": (mine["stories"] as? Int) ?? 0]

            placedRaw.removeLast()
            txn.updateData([
                "placed": placedRaw, "drawPile": pile, "stats": stats,
                "acted": ((g["acted"] as? [String]) ?? []).filter { $0 != uid },
                "placedBy": ((g["placedBy"] as? [String]) ?? []).filter { $0 != uid },
                "updatedAt": FieldValue.serverTimestamp(),
            ], forDocument: self.gameRef(gameId))
            txn.setData(["cards": cards.map { ["d": $0.d, "i": $0.i] }], forDocument: self.handRef(gameId, uid))
            return nil
        }
    }

    func skipTurn(_ gameId: String) async throws {
        guard let uid = uid else { return }
        _ = try await db.runTransaction { txn, errPtr -> Any? in
            guard let gSnap = self.txnGet(txn, self.gameRef(gameId), errPtr), let g = gSnap.data() else { return nil }
            guard ((g["players"] as? [[String: Any]]) ?? []).contains(where: { ($0["uid"] as? String) == uid }) else { return nil }
            if ((g["acted"] as? [String]) ?? []).contains(uid) { return nil }
            txn.updateData(self.moveComplete(g, uid, ["updatedAt": FieldValue.serverTimestamp()]), forDocument: self.gameRef(gameId))
            return nil
        }
    }

    // MARK: Moderation

    /// Persist a report of another player's story so it can be reviewed and
    /// acted on (App Store guideline 1.2). Written to a top-level `versusReports`
    /// collection with the offending content and both parties' ids.
    func reportStory(gameId: String, story: VersusStory, reason: String, details: String) async throws {
        try await db.collection("versusReports").addDocument(data: [
            "gameId": gameId,
            "storyId": story.id,
            "reportedUid": story.byUid,
            "reportedName": story.byName,
            "storyText": story.text,
            "reason": reason,
            "details": details.trimmingCharacters(in: .whitespacesAndNewlines),
            "reporterUid": uid ?? "anonymous",
            "status": "pending",
            "ts": FieldValue.serverTimestamp(),
        ])
    }

    // MARK: Story

    func writeStory(_ gameId: String, event: VersusPlaced, twist: VersusPlaced, text: String) async throws {
        guard let uid = uid else { throw e("Sign in to write.") }
        let t = ContentFilter.masked(text.trimmingCharacters(in: .whitespacesAndNewlines))
        guard !t.isEmpty else { return }
        let evCard = XIDeck.events[event.i], twCard = XIDeck.twists[twist.i]
        let pk = "\(evCard.id)__\(twCard.id)"
        var name = "Player"; var color: String?

        _ = try await db.runTransaction { txn, errPtr -> Any? in
            guard let gSnap = self.txnGet(txn, self.gameRef(gameId), errPtr), let g = gSnap.data() else {
                errPtr?.pointee = self.e("Game not found."); return nil
            }
            let players = (g["players"] as? [[String: Any]]) ?? []
            guard players.contains(where: { ($0["uid"] as? String) == uid }) else { errPtr?.pointee = self.e("Join the game first."); return nil }
            guard (g["status"] as? String ?? "active") != "waiting" else {
                errPtr?.pointee = self.e("The game hasn't started yet."); return nil
            }
            if ((g["acted"] as? [String]) ?? []).contains(uid) { errPtr?.pointee = self.e("You've already gone this round."); return nil }
            let me = players.first { ($0["uid"] as? String) == uid }
            name = me?["name"] as? String ?? "Player"; color = me?["color"] as? String
            var stats = (g["stats"] as? [String: [String: Any]]) ?? [:]
            let mine = stats[uid] ?? [:]
            stats[uid] = ["placed": (mine["placed"] as? Int) ?? 0, "stories": ((mine["stories"] as? Int) ?? 0) + 1]
            let placedBy = ((g["placedBy"] as? [String]) ?? []).filter { $0 != uid }
            txn.updateData(self.moveComplete(g, uid, ["stats": stats, "placedBy": placedBy, "updatedAt": FieldValue.serverTimestamp()]), forDocument: self.gameRef(gameId))
            return nil
        }

        _ = try await gameRef(gameId).collection("stories").addDocument(data: [
            "byUid": uid, "byName": name, "color": color ?? NSNull(), "pairKey": pk,
            "eventCap": evCard.cap, "twistCap": twCard.cap, "text": t, "ts": Date().timeIntervalSince1970 * 1000,
        ])

        let title = "times i \(evCard.cap.lowercased()), \(twCard.cap.lowercased())"
        let tags = [slugTag(evCard.cap), slugTag(twCard.cap)].compactMap { $0 }
        let now = Date(); let iso = ISO8601DateFormatter(); iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let df = DateFormatter(); df.dateStyle = .short
        let memRef = try? await db.collection("users").document(uid).collection("memories").addDocument(data: [
            "content": t, "title": title, "hashtags": tags, "source": "xi", "mode": "versus",
            "event": ["id": evCard.id, "cap": evCard.cap], "twist": ["id": twCard.id, "cap": twCard.cap],
            "pairKey": pk, "timestamp": iso.string(from: now), "dateTime": df.string(from: now),
            "gameId": gameId, "createdAt": FieldValue.serverTimestamp(), "updatedAt": FieldValue.serverTimestamp(),
        ])
        // Swap the card-pair title for an AI title distilled from the story itself,
        // in the background — same as saving from the daily board. Falls back
        // silently to the template title if AI is unavailable.
        if let memRef {
            Task {
                if let ai = await XIService.shared.generateTitle(from: t) {
                    try? await memRef.updateData(["title": ai, "updatedAt": FieldValue.serverTimestamp()])
                }
            }
            // "Stories I tell": Versus stories are public by default — people
            // have stories they tell. Publishing routes through the
            // publishMemory AI safety screen; Settings can turn this off.
            if SharePrefs.shared.versusPublic {
                let mid = memRef.documentID
                Task { await XIService.shared.setMemoryVisibility(mid, isPublic: true) }
            }
        }
    }

    // MARK: helpers

    private func moveComplete(_ g: [String: Any], _ uid: String, _ base: [String: Any]) -> [String: Any] {
        var acted = (g["acted"] as? [String]) ?? []
        if !acted.contains(uid) { acted.append(uid) }
        let allUids = ((g["players"] as? [[String: Any]]) ?? []).compactMap { $0["uid"] as? String }
        let allDone = !allUids.isEmpty && allUids.allSatisfy { acted.contains($0) }
        var out = base
        if allDone {
            out["acted"] = [String](); out["round"] = ((g["round"] as? Int) ?? 0) + 1; out["placedBy"] = [String]()
        } else {
            out["acted"] = acted
        }
        return out
    }

    private func txnGet(_ txn: Transaction, _ ref: DocumentReference, _ errPtr: NSErrorPointer) -> DocumentSnapshot? {
        do { return try txn.getDocument(ref) } catch { errPtr?.pointee = error as NSError; return nil }
    }

    private func encodePlaced(_ p: VersusPlaced) -> [String: Any] {
        ["r": p.r, "c": p.c, "d": p.d, "i": p.i, "by": p.by ?? NSNull(), "color": p.color ?? NSNull()]
    }
    fileprivate func decodePlaced(_ m: [String: Any]) -> VersusPlaced? {
        guard let r = m["r"] as? Int, let c = m["c"] as? Int, let d = m["d"] as? String, let i = m["i"] as? Int else { return nil }
        return VersusPlaced(r: r, c: c, d: d, i: i, by: m["by"] as? String, color: m["color"] as? String)
    }
    fileprivate func decodeCard(_ m: [String: Any]) -> HandCard? {
        Self.decodeCardStatic(m)
    }
    private func slugTag(_ cap: String) -> String? {
        let s = cap.lowercased().replacingOccurrences(of: "[^a-z0-9]+", with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        return s.isEmpty ? nil : "#\(s)"
    }

    // MARK: static decoders for the live store

    static func decodeGame(id: String, _ d: [String: Any]) -> VersusGameState {
        let players = ((d["players"] as? [[String: Any]]) ?? []).compactMap { p -> VersusPlayer? in
            guard let uid = p["uid"] as? String else { return nil }
            return VersusPlayer(uid: uid, name: p["name"] as? String ?? "Player", color: p["color"] as? String ?? "#34495e", order: p["order"] as? Int ?? 0)
        }.sorted { $0.order < $1.order }
        let placed = ((d["placed"] as? [[String: Any]]) ?? []).compactMap { m -> VersusPlaced? in
            guard let r = m["r"] as? Int, let c = m["c"] as? Int, let dd = m["d"] as? String, let i = m["i"] as? Int else { return nil }
            return VersusPlaced(r: r, c: c, d: dd, i: i, by: m["by"] as? String, color: m["color"] as? String)
        }
        var stats: [String: [String: Int]] = [:]
        for (k, v) in (d["stats"] as? [String: [String: Any]]) ?? [:] {
            stats[k] = ["placed": v["placed"] as? Int ?? 0, "stories": v["stories"] as? Int ?? 0]
        }
        return VersusGameState(
            id: id, players: players, round: d["round"] as? Int ?? 0,
            acted: d["acted"] as? [String] ?? [], placedBy: d["placedBy"] as? [String] ?? [],
            placed: placed, drawPileCount: ((d["drawPile"] as? [[String: Any]]) ?? []).count,
            stats: stats, status: d["status"] as? String ?? "active",
            createdBy: d["createdBy"] as? String ?? "",
            expectedPlayers: d["expectedPlayers"] as? Int ?? 2,
            invites: ((d["invites"] as? [[String: Any]]) ?? []).map {
                VersusInvite(token: $0["token"] as? String ?? "",
                             name: $0["name"] as? String ?? "",
                             claimedBy: $0["claimedBy"] as? String)
            }
        )
    }
    static func decodeCardStatic(_ m: [String: Any]) -> HandCard? {
        guard let d = m["d"] as? String, let i = m["i"] as? Int else { return nil }
        // An index past our pools means another player has newer shared deck
        // extras — pull them (append-only, so the index resolves after).
        let n = d == "ev" || d == "be" ? XIDeck.events.count : XIDeck.twists.count
        if i >= n { XIDeckExtras.noteStaleIndex() }
        return HandCard(d: d, i: i)
    }
    static func decodeStory(_ doc: QueryDocumentSnapshot) -> VersusStory? {
        let m = doc.data()
        return VersusStory(
            id: doc.documentID, byUid: m["byUid"] as? String ?? "", byName: m["byName"] as? String ?? "Player",
            color: m["color"] as? String ?? "#34495e",
            pairKey: m["pairKey"] as? String ?? "", eventCap: m["eventCap"] as? String ?? "",
            twistCap: m["twistCap"] as? String ?? "", text: m["text"] as? String ?? "", ts: m["ts"] as? Double ?? 0
        )
    }
}

/// Live subscriptions to a game, your hand, and the stories feed.
@MainActor
final class VersusStore: ObservableObject {
    @Published var game: VersusGameState?
    @Published var hand: [HandCard] = []
    @Published var stories: [VersusStory] = []
    @Published var notFound = false

    private let db = Firestore.firestore()
    private var gameReg, handReg, storyReg: ListenerRegistration?

    func subscribe(gameId: String, uid: String) {
        unsubscribe()
        gameReg = db.collection("versusGames").document(gameId).addSnapshotListener { [weak self] snap, _ in
            Task { @MainActor in
                guard let self else { return }
                if let snap, snap.exists, let d = snap.data() {
                    self.game = VersusService.decodeGame(id: gameId, d); self.notFound = false
                } else { self.game = nil; self.notFound = true }
            }
        }
        handReg = db.collection("versusGames").document(gameId).collection("hands").document(uid).addSnapshotListener { [weak self] snap, _ in
            Task { @MainActor in self?.hand = ((snap?.data()?["cards"] as? [[String: Any]]) ?? []).compactMap(VersusService.decodeCardStatic) }
        }
        storyReg = db.collection("versusGames").document(gameId).collection("stories").order(by: "ts", descending: true).addSnapshotListener { [weak self] snap, _ in
            Task { @MainActor in self?.stories = (snap?.documents ?? []).compactMap(VersusService.decodeStory) }
        }
    }

    func unsubscribe() {
        gameReg?.remove(); handReg?.remove(); storyReg?.remove()
        gameReg = nil; handReg = nil; storyReg = nil
    }
}
