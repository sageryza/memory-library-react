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
    let id: String, byName: String, color: String, pairKey: String
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
    let status: String
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
            if let dn = u.displayName, !dn.isEmpty { return dn }
            if let em = u.email, let p = em.split(separator: "@").first { return String(p) }
        }
        return "Player"
    }

    private static let idChars = Array("abcdefghijkmnpqrstuvwxyz23456789")
    private func generateId() -> String { String((0..<8).map { _ in Self.idChars.randomElement()! }) }

    // MARK: Create / join

    func createGame() async throws -> String {
        guard let uid = uid else { throw e("Sign in to start a Versus game.") }
        let id = generateId()
        let seeded = VersusModel.seedBoard(eventCount: XIDeck.events.count, twistCount: XIDeck.twists.count)
        let creator: [String: Any] = ["uid": uid, "name": currentName(), "color": VersusModel.playerColors[0], "order": 0]
        try await gameRef(id).setData([
            "createdBy": uid,
            "createdAt": FieldValue.serverTimestamp(),
            "updatedAt": FieldValue.serverTimestamp(),
            "status": "active",
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

    func joinGame(_ gameId: String) async throws {
        guard let uid = uid else { throw e("Sign in to join.") }
        let snap = try await gameRef(gameId).getDocument()
        guard let g = snap.data() else { throw e("Game not found.") }
        let players = (g["players"] as? [[String: Any]]) ?? []
        if players.contains(where: { ($0["uid"] as? String) == uid }) { return }
        let order = players.count
        let player: [String: Any] = [
            "uid": uid, "name": currentName(),
            "color": VersusModel.playerColors[order % VersusModel.playerColors.count], "order": order,
        ]
        try await gameRef(gameId).updateData([
            "players": players + [player],
            "stats.\(uid)": ["placed": 0, "stories": 0],
            "updatedAt": FieldValue.serverTimestamp(),
        ])
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

    // MARK: Story

    func writeStory(_ gameId: String, event: VersusPlaced, twist: VersusPlaced, text: String) async throws {
        guard let uid = uid else { throw e("Sign in to write.") }
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines); guard !t.isEmpty else { return }
        let evCard = XIDeck.events[event.i], twCard = XIDeck.twists[twist.i]
        let pk = "\(evCard.id)__\(twCard.id)"
        var name = "Player"; var color: String?

        _ = try await db.runTransaction { txn, errPtr -> Any? in
            guard let gSnap = self.txnGet(txn, self.gameRef(gameId), errPtr), let g = gSnap.data() else {
                errPtr?.pointee = self.e("Game not found."); return nil
            }
            let players = (g["players"] as? [[String: Any]]) ?? []
            guard players.contains(where: { ($0["uid"] as? String) == uid }) else { errPtr?.pointee = self.e("Join the game first."); return nil }
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

        let title = "times i \(evCard.cap.lowercased()) \(twCard.cap.lowercased())"
        let tags = [slugTag(evCard.cap), slugTag(twCard.cap)].compactMap { $0 }
        let now = Date(); let iso = ISO8601DateFormatter(); iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let df = DateFormatter(); df.dateStyle = .short
        _ = try? await db.collection("users").document(uid).collection("memories").addDocument(data: [
            "content": t, "title": title, "hashtags": tags, "source": "xi", "mode": "versus",
            "event": ["id": evCard.id, "cap": evCard.cap], "twist": ["id": twCard.id, "cap": twCard.cap],
            "pairKey": pk, "timestamp": iso.string(from: now), "dateTime": df.string(from: now),
            "gameId": gameId, "createdAt": FieldValue.serverTimestamp(), "updatedAt": FieldValue.serverTimestamp(),
        ])
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
        guard let d = m["d"] as? String, let i = m["i"] as? Int else { return nil }
        return HandCard(d: d, i: i)
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
            stats: stats, status: d["status"] as? String ?? "active"
        )
    }
    static func decodeCardStatic(_ m: [String: Any]) -> HandCard? {
        guard let d = m["d"] as? String, let i = m["i"] as? Int else { return nil }
        return HandCard(d: d, i: i)
    }
    static func decodeStory(_ doc: QueryDocumentSnapshot) -> VersusStory? {
        let m = doc.data()
        return VersusStory(
            id: doc.documentID, byName: m["byName"] as? String ?? "Player", color: m["color"] as? String ?? "#34495e",
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
