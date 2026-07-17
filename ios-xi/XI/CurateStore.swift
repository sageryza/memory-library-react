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

    /// The five decks, in pool order.
    static let decks: [XIDeckDef] = [
        .init(id: "midjourney", nick: "midjourney", split: false),
        .init(id: "internet", nick: "internet", split: false),
        .init(id: "dreams", nick: "dreams", split: false),
        .init(id: "claude", nick: "claude", split: true),
        .init(id: "chatgpt", nick: "chatgpt", split: true),
    ]
    static let splitDecks: Set<String> = Set(decks.filter(\.split).map(\.id))

    @Published private(set) var excluded: Set<String>
    @Published private(set) var loved: Set<String>
    @Published private(set) var disabledDecks: Set<String>
    @Published private(set) var lovedOn: Bool

    private let exKey = "xi.excluded.v2"     // role keys ("ev:5"); v1 stored card ids
    private let loKey = "xi.loved.v2"
    private let ddKey = "xi.disabledDecks.v1"
    private let lonKey = "xi.lovedOn.v1"

    /// Card id → (role, pool index), across both pools.
    private let roleIndexByID: [String: (role: String, i: Int)]
    private var authHandle: AuthStateDidChangeListenerHandle?
    private var hydratedFor: String?
    private var saveTask: Task<Void, Never>?

    init() {
        var map: [String: (String, Int)] = [:]
        for (i, c) in XIDeck.events.enumerated() { map[c.id] = ("ev", i) }
        for (i, c) in XIDeck.twists.enumerated() { map[c.id] = ("tw", i) }
        roleIndexByID = map

        let d = UserDefaults.standard
        // One-time migration of the v1 id-keyed sets into role keys.
        func loadSet(_ v2: String, migratingFrom v1: String) -> Set<String> {
            if let arr = d.stringArray(forKey: v2) { return Set(arr) }
            return Set((d.stringArray(forKey: v1) ?? []).compactMap { id in
                map[id].map { "\($0.0):\($0.1)" }
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

    /// The key(s) a ♥/✕ on this card affects. Interchangeable cards occupy the
    /// SAME index in both pools, so toggles hit both roles at once (the web's
    /// `curateRoleKeys`); split-deck cards toggle only their own role.
    private func roleKeys(_ id: String) -> [String] {
        guard let r = roleIndexByID[id] else { return [] }
        let card = r.role == "ev" ? XIDeck.events[r.i] : XIDeck.twists[r.i]
        if let deck = card.deck, !Self.splitDecks.contains(deck) {
            return ["ev:\(r.i)", "tw:\(r.i)"]
        }
        return ["\(r.role):\(r.i)"]
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

    func isDeckOn(_ deckID: String) -> Bool { !disabledDecks.contains(deckID) }

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
            let cid = r.inter ? "i\(r.i)" : key
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
            if excluded.contains(key) { continue }
            let sourceOn = !(c.deck.map { disabledDecks.contains($0) } ?? false)
            if sourceOn || (lovedOn && loved.contains(key)) { out.append(i) }
        }
        return out
    }

    var allowedEvents: [Int] { allowedIndices(XIDeck.events, role: "ev") }
    var allowedTwists: [Int] { allowedIndices(XIDeck.twists, role: "tw") }

    /// In-play subset of a pool (falls back to the full pool if curation
    /// removed everything, so the app never deals from an empty deck).
    func keep(_ cards: [XICard], role: String) -> [XICard] {
        let idx = allowedIndices(cards, role: role)
        return idx.isEmpty ? cards : idx.map { cards[$0] }
    }
}
