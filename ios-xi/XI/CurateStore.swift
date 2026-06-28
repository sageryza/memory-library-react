import SwiftUI

/// Holds the user's curation of the deck — which cards are removed (excluded)
/// and which are hearted (loved) — persisted locally. Mirrors the web's
/// `xi2_excluded` / `xi2_loved` sets; keyed by card id. Removed cards are
/// skipped when dealing the Today pairing.
@MainActor
final class CurateStore: ObservableObject {
    static let shared = CurateStore()

    @Published private(set) var excluded: Set<String>
    @Published private(set) var loved: Set<String>

    private let exKey = "xi.excluded.v1"
    private let loKey = "xi.loved.v1"

    init() {
        excluded = Set(UserDefaults.standard.stringArray(forKey: exKey) ?? [])
        loved = Set(UserDefaults.standard.stringArray(forKey: loKey) ?? [])
    }

    func isExcluded(_ id: String) -> Bool { excluded.contains(id) }
    func isLoved(_ id: String) -> Bool { loved.contains(id) }

    func toggleExcluded(_ id: String) {
        if excluded.contains(id) { excluded.remove(id) } else { excluded.insert(id) }
        UserDefaults.standard.set(Array(excluded), forKey: exKey)
    }

    func toggleLoved(_ id: String) {
        if loved.contains(id) { loved.remove(id) } else { loved.insert(id) }
        UserDefaults.standard.set(Array(loved), forKey: loKey)
    }

    /// Non-excluded subset of a pool (falls back to the full pool if everything
    /// was removed, so the app never deals from an empty deck).
    func keep(_ cards: [XICard]) -> [XICard] {
        let f = cards.filter { !excluded.contains($0.id) }
        return f.isEmpty ? cards : f
    }
}
