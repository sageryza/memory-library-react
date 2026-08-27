import Foundation
import FirebaseAuth
import FirebaseFirestore
import FirebaseFunctions

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
    /// Set when the story was TOLD rather than typed: the recording everyone
    /// presses play on, and how long it runs. `text` is the whole story either
    /// way — typed, or transcribed free on the teller's own device.
    var audioUrl: String?
    var audioSec: Double = 0
    var isSpoken: Bool { !(audioUrl ?? "").isEmpty }
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
    /// Games are live ("active") from birth now. "waiting" only appears on
    /// docs from older builds (the retired fixed-headcount format) — the
    /// first join flips them live. Docs without the field decode as "active".
    let status: String
    let createdBy: String
    /// Legacy (retired): the old fixed-headcount trigger. Kept only so older
    /// docs decode; nothing starts or locks on it any more.
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
    /// name), so the game can show exactly who's accepted. Games are live from
    /// birth — no waiting room, no headcount, no lock: friends join whenever
    /// they tap the link, and the creator can kick a wrong join.
    func createGame(invites: [(token: String, name: String)] = []) async throws -> String {
        guard let uid = uid else { throw e("Sign in to start a Versus game.") }
        // Versus needs a REAL account: names and turn-notification emails come
        // from the account, and anonymous ghost players were a real incident.
        guard Auth.auth().currentUser?.isAnonymous != true else {
            throw e("Versus needs a real account — sign in to play.")
        }
        let id = generateId()
        // The deck honors the creator's Curate removals + deck toggles (a
        // curated game for everyone in it), falling back to the full pools when
        // too few cards remain to seed and draw — matching the web. Retired
        // decks are ALWAYS excluded here, curator or not: a game is played with
        // other people, so it deals from the deck everyone else has.
        let beAll = CurateStore.shared.sharedEvents
        let bwAll = CurateStore.shared.sharedTwists
        let seeded = VersusModel.seedBoard(
            eventPool: beAll.count >= 6 ? beAll : CurateStore.sharedIndices(XIDeck.events),
            twistPool: bwAll.count >= 6 ? bwAll : CurateStore.sharedIndices(XIDeck.twists))
        let creator: [String: Any] = ["uid": uid, "name": currentName(), "color": VersusModel.playerColors[0], "order": 0]
        try await gameRef(id).setData([
            "createdBy": uid,
            "createdAt": FieldValue.serverTimestamp(),
            "updatedAt": FieldValue.serverTimestamp(),
            "status": "active",
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
        guard Auth.auth().currentUser?.isAnonymous != true else {
            throw e("Versus needs a real account — sign in to play.")
        }
        let name = currentName()
        // Transactional: two players joining at the same moment must not clobber
        // each other's entry or compute the same order.
        _ = try await db.runTransaction { txn, errPtr -> Any? in
            guard let gSnap = self.txnGet(txn, self.gameRef(gameId), errPtr), let g = gSnap.data() else {
                errPtr?.pointee = self.e("Game not found."); return nil
            }
            let players = (g["players"] as? [[String: Any]]) ?? []
            if players.contains(where: { ($0["uid"] as? String) == uid }) {
                // Already in — still claim the tracked seat if this tap carried
                // a token (a sign-in detour or a plain "join" can land the join
                // before the token gets read; the seat must not stay "…").
                if let claimed = Self.claimingInvites(g, token: inviteToken, uid: uid) {
                    txn.updateData(["invites": claimed], forDocument: self.gameRef(gameId))
                }
                return nil
            }
            // Games never lock — anyone with the invite link can join at any
            // point, even mid-game. (The creator can kick a wrong join.)
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
            // Tracked invite: mark this seat claimed so the game shows exactly
            // who's in.
            if let claimed = Self.claimingInvites(g, token: inviteToken, uid: uid) {
                update["invites"] = claimed
            }
            // Docs from older builds open as "waiting" (the retired fixed-
            // headcount format) — the first join brings them live for everyone.
            if (g["status"] as? String ?? "active") == "waiting" {
                update["status"] = "active"
            }
            txn.updateData(update, forDocument: self.gameRef(gameId))
            return nil
        }
    }

    /// The invites array with this token's seat marked claimed, or nil when
    /// there is nothing to claim (no token, unknown token, or already claimed).
    private static func claimingInvites(_ g: [String: Any], token: String?, uid: String) -> [[String: Any]]? {
        guard let token, !token.isEmpty else { return nil }
        var invites = (g["invites"] as? [[String: Any]]) ?? []
        guard let i = invites.firstIndex(where: { ($0["token"] as? String) == token && $0["claimedBy"] == nil }) else { return nil }
        invites[i]["claimedBy"] = uid
        return invites
    }

    /// Leave a game yourself: your hand slides back under the draw pile (the
    /// hands security rules mean only YOU can return your cards) and you come
    /// off the roster. Placed cards and written stories stay on the board.
    func leaveGame(_ gameId: String) async throws {
        guard let uid = uid else { return }
        _ = try await db.runTransaction { txn, errPtr -> Any? in
            guard let gSnap = self.txnGet(txn, self.gameRef(gameId), errPtr), let g = gSnap.data() else { return nil }
            guard ((g["players"] as? [[String: Any]]) ?? []).contains(where: { ($0["uid"] as? String) == uid }) else { return nil }
            let hSnap = self.txnGet(txn, self.handRef(gameId, uid), errPtr)
            let cards = (hSnap?.data()?["cards"] as? [[String: Any]]) ?? []
            var update = self.withoutPlayer(g, uid)
            update["drawPile"] = ((g["drawPile"] as? [[String: Any]]) ?? []) + cards
            update["updatedAt"] = FieldValue.serverTimestamp()
            txn.updateData(update, forDocument: self.gameRef(gameId))
            if hSnap?.exists == true { txn.deleteDocument(self.handRef(gameId, uid)) }
            return nil
        }
    }

    /// Kick a player out (creator only — enforced in the UI, always behind an
    /// are-you-sure). Their hidden hand doc is theirs alone under the security
    /// rules, so it stays put — if they rejoin via the link later they simply
    /// pick their old hand back up.
    func kickPlayer(_ gameId: String, targetUid: String) async throws {
        guard let uid = uid, targetUid != uid else { return }
        _ = try await db.runTransaction { txn, errPtr -> Any? in
            guard let gSnap = self.txnGet(txn, self.gameRef(gameId), errPtr), let g = gSnap.data() else { return nil }
            guard ((g["players"] as? [[String: Any]]) ?? []).contains(where: { ($0["uid"] as? String) == targetUid }) else { return nil }
            var update = self.withoutPlayer(g, targetUid)
            update["updatedAt"] = FieldValue.serverTimestamp()
            txn.updateData(update, forDocument: self.gameRef(gameId))
            return nil
        }
    }

    /// Roster math shared by leave/kick: drop a player from every per-round
    /// list, and if everyone REMAINING has already acted, advance the round
    /// exactly like a completed move would — otherwise the round could stall
    /// forever waiting on a player who's no longer in the game.
    private func withoutPlayer(_ g: [String: Any], _ dropUid: String) -> [String: Any] {
        let players = ((g["players"] as? [[String: Any]]) ?? []).filter { ($0["uid"] as? String) != dropUid }
        let acted = ((g["acted"] as? [String]) ?? []).filter { $0 != dropUid }
        let placedBy = ((g["placedBy"] as? [String]) ?? []).filter { $0 != dropUid }
        var stats = (g["stats"] as? [String: [String: Any]]) ?? [:]
        stats.removeValue(forKey: dropUid)
        let uids = players.compactMap { $0["uid"] as? String }
        let allDone = !uids.isEmpty && uids.allSatisfy { acted.contains($0) }
        if allDone {
            return ["players": players, "stats": stats, "acted": [String](),
                    "placedBy": [String](), "round": ((g["round"] as? Int) ?? 0) + 1]
        }
        return ["players": players, "stats": stats, "acted": acted, "placedBy": placedBy]
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
            // Only players get dealt cards — joining is explicit now, so this
            // can be called by someone just looking at a game they're not in.
            let roster = (gSnap.data()?["players"] as? [[String: Any]]) ?? []
            guard roster.contains(where: { ($0["uid"] as? String) == uid }) else { return nil }
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
            // A told story's actual content is the recording — a report has to
            // point at it, not just at the line in the feed.
            "storyAudioUrl": story.audioUrl ?? "",
            "reason": reason,
            "details": details.trimmingCharacters(in: .whitespacesAndNewlines),
            "reporterUid": uid ?? "anonymous",
            "status": "pending",
            "ts": FieldValue.serverTimestamp(),
        ])
    }

    // MARK: Story

    /// Bank a spoken take and get its words back: the recording is uploaded and
    /// transcribed server-side (`tellStory`). Transcription can come back empty
    /// — the audio is the story, the text is the convenience on top of it.
    private func tellStory(_ gameId: String, audio: SpokenTake) async throws
        -> (url: String, transcript: String) {
        let res = try await Functions.functions().httpsCallable("tellStory").call([
            "gameId": gameId,
            "audio": audio.data.base64EncodedString(),
            "mime": "audio/m4a",
            "seconds": audio.seconds,
            // Apple already transcribed this on the phone, for free, while it
            // was being told — so the server has nothing to pay for.
            "transcript": audio.transcript,
        ])
        guard let d = res.data as? [String: Any], let url = d["audioUrl"] as? String, !url.isEmpty else {
            throw e("Couldn't save your recording — try again.")
        }
        return (url, (d["transcript"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines))
    }

    /// Write a story on a pairing as your move. `audio` is set when the story
    /// was TOLD out loud — then the recording is what the other players hear,
    /// and the text is what the phone already transcribed while you told it.
    func writeStory(_ gameId: String, event: VersusPlaced, twist: VersusPlaced,
                    text: String, audio: SpokenTake? = nil) async throws {
        guard let uid = uid else { throw e("Sign in to write.") }
        // Upload BEFORE the turn-completing transaction: if the recording can't
        // be saved, the player still has their take and their turn.
        var audioUrl: String?
        var t = ContentFilter.masked(text.trimmingCharacters(in: .whitespacesAndNewlines))
        if let audio {
            let told = try await tellStory(gameId, audio: audio)
            audioUrl = told.url
            // The whole story as the phone heard it. Empty only if speech
            // recognition was off — the recording still plays either way.
            let heard = ContentFilter.masked(told.transcript)
            t = heard.isEmpty ? "told out loud" : heard
        }
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

        var storyDoc: [String: Any] = [
            "byUid": uid, "byName": name, "color": color ?? NSNull(), "pairKey": pk,
            "eventCap": evCard.cap, "twistCap": twCard.cap, "text": t, "ts": Date().timeIntervalSince1970 * 1000,
        ]
        if let audioUrl {
            storyDoc["audioUrl"] = audioUrl
            storyDoc["audioSec"] = audio?.seconds ?? 0
        }
        _ = try await gameRef(gameId).collection("stories").addDocument(data: storyDoc)

        // Your own copy keeps the story plus the recording, so it plays back
        // in your library too.
        let full = t
        let title = "times i \(evCard.cap.lowercased()), \(twCard.cap.lowercased())"
        let tags = [slugTag(evCard.cap), slugTag(twCard.cap)].compactMap { $0 }
        let now = Date(); let iso = ISO8601DateFormatter(); iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let df = DateFormatter(); df.dateStyle = .short
        var memDoc: [String: Any] = [
            "content": full, "title": title, "hashtags": tags, "source": "xi", "mode": "versus",
            "event": ["id": evCard.id, "cap": evCard.cap], "twist": ["id": twCard.id, "cap": twCard.cap],
            "pairKey": pk, "timestamp": iso.string(from: now), "dateTime": df.string(from: now),
            "gameId": gameId, "createdAt": FieldValue.serverTimestamp(), "updatedAt": FieldValue.serverTimestamp(),
        ]
        if let audioUrl { memDoc["audioUrl"] = audioUrl; memDoc["audioSec"] = audio?.seconds ?? 0 }
        let memRef = try? await db.collection("users").document(uid).collection("memories").addDocument(data: memDoc)
        // Swap the card-pair title for an AI title distilled from the story itself,
        // in the background — same as saving from the daily board. Falls back
        // silently to the template title if AI is unavailable.
        if let memRef {
            Task {
                if let ai = await XIService.shared.generateTitle(from: full) {
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
            twistCap: m["twistCap"] as? String ?? "", text: m["text"] as? String ?? "", ts: m["ts"] as? Double ?? 0,
            audioUrl: m["audioUrl"] as? String,
            audioSec: m["audioSec"] as? Double ?? 0
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
