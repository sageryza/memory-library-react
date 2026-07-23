import SwiftUI
import FirebaseAuth
import FirebaseFirestore

/// One of the five named card decks (mirrors the web's `DECKS` in decks.js).
/// Interchangeable decks contribute every card to BOTH the event and twist
/// pools at the same index; split decks have real, separate event/twist lists.
struct XIDeckDef: Identifiable {
    let id: String
    let nick: String
    let split: Bool
}

/// Holds the user's curation of the deck — ✕-removed cards, ♥ hearts, whole
/// decks toggled off, and the "loved" hearts-deck switch — synced with the web
/// through the same `users/{uid}/xiSettings/state` doc, so curating on either
/// platform shapes play on both.
///
/// Sets are role-keyed exactly like the web ("ev:5" / "tw:12", indices into
/// XIDeck.events / .twists); the pools are byte-identical in order across
/// platforms, so the same key always means the same card.
@MainActor
final class CurateStore: ObservableObject {
    static let shared = CurateStore()

    /// The five decks, in pool order. The pool list must NEVER shrink or
    /// reorder — role keys ("ev:5") and archived memories are index-based.
    static let decks: [XIDeckDef] = [
        .init(id: "midjourney", nick: "midjourney", split: false),
        .init(id: "internet", nick: "internet", split: false),
        .init(id: "dreams", nick: "dreams", split: false),
        .init(id: "claude", nick: "claude", split: true),
        .init(id: "chatgpt", nick: "chatgpt", split: true),
    ]
    /// Retired decks (July 2026): midjourney is the only playable deck. The
    /// others stay in the pools so old memories/hearts keep resolving, but
    /// they never deal, and Curate doesn't show them or their toggles.
    /// Individually ♥-loved cards still ride the loved-deck switch.
    ///
    /// EXCEPT for the curator's own account — five-deck curation was Sage's
    /// personal feature, so signing in as her un-retires everything.
    static let curatorEmails: Set<String> = ["sageryza@gmail.com"]
    static var curatorUnlocked: Bool {
        Auth.auth().currentUser?.email.map { curatorEmails.contains($0) } ?? false
    }
    private static let allRetiredDecks: Set<String> = ["internet", "dreams", "claude", "chatgpt"]
    static var retiredDecks: Set<String> { curatorUnlocked ? [] : allRetiredDecks }
    static var activeDecks: [XIDeckDef] { decks.filter { !retiredDecks.contains($0.id) } }
    static let splitDecks: Set<String> = Set(decks.filter(\.split).map(\.id))

    @Published private(set) var excluded: Set<String>
    @Published private(set) var loved: Set<String>
    @Published private(set) var disabledDecks: Set<String>
    @Published private(set) var lovedOn: Bool

    private let exKey = "xi.excluded.v2"     // role keys ("ev:5"); v1 stored card ids
    private let loKey = "xi.loved.v2"
    private let ddKey = "xi.disabledDecks.v1"
    private let lonKey = "xi.lovedOn.v1"

    /// Card id → (role, pool index), across both pools. Rebuilt when shared
    /// deck extras append cards to the pools mid-session.
    private var roleIndexByID: [String: (role: String, i: Int)] = [:]
    private var authHandle: AuthStateDidChangeListenerHandle?
    private var extrasObserver: NSObjectProtocol?
    private var hydratedFor: String?
    private var saveTask: Task<Void, Never>?

    private func rebuildIndex() {
        var map: [String: (String, Int)] = [:]
        for (i, c) in XIDeck.events.enumerated() { map[c.id] = ("ev", i) }
        for (i, c) in XIDeck.twists.enumerated() { map[c.id] = ("tw", i) }
        roleIndexByID = map
    }

    init() {
        rebuildIndex()
        extrasObserver = NotificationCenter.default.addObserver(
            forName: XIDeckExtras.changed, object: nil, queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            self.rebuildIndex()
            self.objectWillChange.send()   // pools changed — every screen re-derives
        }

        let d = UserDefaults.standard
        // One-time migration of the v1 id-keyed sets into role keys.
        func loadSet(_ v2: String, migratingFrom v1: String) -> Set<String> {
            if let arr = d.stringArray(forKey: v2) { return Set(arr) }
            return Set((d.stringArray(forKey: v1) ?? []).compactMap { id in
                self.roleIndexByID[id].map { "\($0.role):\($0.i)" }
            })
        }
        excluded = loadSet(exKey, migratingFrom: "xi.excluded.v1")
        loved = loadSet(loKey, migratingFrom: "xi.loved.v1")
        // Fresh installs start on the midjourney deck only — the other four are
        // opt-in from Curate. A stored choice (local or synced) always wins.
        disabledDecks = Set(d.stringArray(forKey: ddKey) ?? ["internet", "dreams", "claude", "chatgpt"])
        lovedOn = d.bool(forKey: lonKey)

        // Adopt the shared curation doc whenever a user signs in, once per uid.
        authHandle = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            guard let uid = user?.uid else { return }
            Task { @MainActor in await self?.hydrate(uid: uid) }
        }
    }

    // MARK: - Firestore sync (users/{uid}/xiSettings/state)

    private func stateRef(_ uid: String) -> DocumentReference {
        Firestore.firestore().collection("users").document(uid)
            .collection("xiSettings").document("state")
    }

    private func hydrate(uid: String) async {
        guard hydratedFor != uid else { return }
        hydratedFor = uid
        guard let snap = try? await stateRef(uid).getDocument(), snap.exists,
              let data = snap.data() else { return }
        if let a = data["excluded"] as? [String] { excluded = Set(a) }
        if let a = data["loved"] as? [String] { loved = Set(a) }
        if let a = data["disabledDecks"] as? [String] { disabledDecks = Set(a) }
        if let b = data["lovedOn"] as? Bool { lovedOn = b }
        persistLocal()
    }

    private func persistLocal() {
        let d = UserDefaults.standard
        d.set(Array(excluded), forKey: exKey)
        d.set(Array(loved), forKey: loKey)
        d.set(Array(disabledDecks), forKey: ddKey)
        d.set(lovedOn, forKey: lonKey)
    }

    private func persist() {
        persistLocal()
        guard let uid = Auth.auth().currentUser?.uid else { return }
        let payload: [String: Any] = [
            "excluded": Array(excluded),
            "loved": Array(loved),
            "disabledDecks": Array(disabledDecks),
            "lovedOn": lovedOn,
        ]
        saveTask?.cancel()
        saveTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 400_000_000)   // debounced, like the web
            guard !Task.isCancelled, let self else { return }
            try? await self.stateRef(uid).setData(payload, merge: true)
        }
    }

    // MARK: - Role keys

    /// The key(s) a ♥/✕ on this card affects. Interchangeable cards pair by
    /// POSITION WITHIN THEIR DECK across the two pools (the web's
    /// `curateRoleKeys`) — for the bundled decks that equals same-index, but
    /// shared-extras cards append to pools of different lengths, so absolute
    /// indices differ while deck positions still line up. Split-deck cards
    /// toggle only their own role.
    private func roleKeys(_ id: String) -> [String] {
        guard let r = roleIndexByID[id] else { return [] }
        let card = r.role == "ev" ? XIDeck.events[r.i] : XIDeck.twists[r.i]
        guard let deck = card.deck, !Self.splitDecks.contains(deck) else {
            return ["\(r.role):\(r.i)"]
        }
        let evList = XIDeck.events.indices.filter { XIDeck.events[$0].deck == deck }
        let twList = XIDeck.twists.indices.filter { XIDeck.twists[$0].deck == deck }
        let own = r.role == "ev" ? evList : twList
        guard let p = own.firstIndex(of: r.i) else { return ["\(r.role):\(r.i)"] }
        var keys: [String] = []
        if p < evList.count { keys.append("ev:\(evList[p])") }
        if p < twList.count { keys.append("tw:\(twList[p])") }
        return keys.isEmpty ? ["\(r.role):\(r.i)"] : keys
    }

    private func ownKey(_ id: String) -> String? {
        roleIndexByID[id].map { "\($0.role):\($0.i)" }
    }

    private func cardForKey(_ key: String) -> (card: XICard, inter: Bool, i: Int)? {
        let parts = key.split(separator: ":")
        guard parts.count == 2, let i = Int(parts[1]) else { return nil }
        let pool = parts[0] == "ev" ? XIDeck.events : XIDeck.twists
        guard i >= 0 && i < pool.count else { return nil }
        let c = pool[i]
        let inter = c.deck.map { !Self.splitDecks.contains($0) } ?? false
        return (c, inter, i)
    }

    // MARK: - Card toggles

    func isExcluded(_ id: String) -> Bool { ownKey(id).map { excluded.contains($0) } ?? false }
    func isLoved(_ id: String) -> Bool { ownKey(id).map { loved.contains($0) } ?? false }

    func toggleExcluded(_ id: String) {
        let keys = roleKeys(id)
        guard let first = keys.first else { return }
        let on = excluded.contains(first)
        for k in keys {
            if on { excluded.remove(k) } else { excluded.insert(k); loved.remove(k) }
        }
        persist()
    }

    func toggleLoved(_ id: String) {
        let keys = roleKeys(id)
        guard let first = keys.first else { return }
        let on = loved.contains(first)
        for k in keys {
            if on { loved.remove(k) } else { loved.insert(k); excluded.remove(k) }
        }
        persist()
    }

    // MARK: - Deck toggles

    func isDeckOn(_ deckID: String) -> Bool {
        !Self.retiredDecks.contains(deckID) && !disabledDecks.contains(deckID)
    }

    func toggleDeck(_ deckID: String) {
        if disabledDecks.contains(deckID) { disabledDecks.remove(deckID) }
        else { disabledDecks.insert(deckID) }
        persist()
    }

    func toggleLovedDeck() {
        lovedOn.toggle()
        persist()
    }

    /// Distinct loved cards, deduped so an interchangeable card hearted as both
    /// roles shows/counts once (the web's `lovedList`).
    var lovedCards: [XICard] {
        var out: [XICard] = []
        var seen = Set<String>()
        for key in loved.sorted() {
            guard let r = cardForKey(key) else { continue }
            // Dedupe interchangeable cards by their base id, not index —
            // extras cards sit at different indices in the two pools.
            let cid = r.inter
                ? "i-" + r.card.id.replacingOccurrences(
                    of: #"^board-(event|twist)-"#, with: "", options: .regularExpression)
                : key
            if seen.contains(cid) { continue }
            seen.insert(cid)
            out.append(r.card)
        }
        return out
    }

    // MARK: - What's in play

    /// Indices of a pool still in play for a role ("ev" | "tw"): not ✕-removed,
    /// and either from an enabled deck OR loved while the loved deck is on.
    /// Mirrors the web's `allowedIndices`.
    func allowedIndices(_ cards: [XICard], role: String) -> [Int] {
        var out: [Int] = []
        for (i, c) in cards.enumerated() {
            let key = "\(role):\(i)"
            if excluded.contains(key) || XIDeck.isHidden(c) { continue }
            let sourceOn = !(c.deck.map { disabledDecks.contains($0) || Self.retiredDecks.contains($0) } ?? false)
            if sourceOn || (lovedOn && loved.contains(key)) { out.append(i) }
        }
        return out
    }

    var allowedEvents: [Int] { allowedIndices(XIDeck.events, role: "ev") }
    var allowedTwists: [Int] { allowedIndices(XIDeck.twists, role: "tw") }

    /// Non-retired indices of a pool — the correct "everything" fallback when
    /// curation leaves too few cards (never resurrects retired decks).
    static func liveIndices(_ cards: [XICard]) -> [Int] {
        let idx = cards.indices.filter {
            !(cards[$0].deck.map { retiredDecks.contains($0) } ?? false) && !XIDeck.isHidden(cards[$0])
        }
        return idx.isEmpty ? Array(cards.indices) : idx
    }

    /// In-play subset of a pool (falls back to the non-retired pool if
    /// curation removed everything, so the app never deals from an empty
    /// deck — and never resurrects retired decks in the process).
    func keep(_ cards: [XICard], role: String) -> [XICard] {
        let idx = allowedIndices(cards, role: role)
        if !idx.isEmpty { return idx.map { cards[$0] } }
        let live = cards.filter { !($0.deck.map { Self.retiredDecks.contains($0) } ?? false) && !XIDeck.isHidden($0) }
        return live.isEmpty ? cards : live
    }
}
