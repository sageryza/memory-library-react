import Foundation
import FirebaseFirestore

/// The SHARED midjourney deck extras — the same `xi/deckExtras` doc the web
/// reads: cards Sage adds for everyone (`added`, append-only so pool indices
/// stay stable on every client) and base ids removed everywhere (`removed`,
/// reversible hides). Cached in UserDefaults so launch applies them
/// synchronously; `refresh()` fetches fresh data and applies any delta live.
enum XIDeckExtras {
    struct Entry: Codable, Equatable {
        let id: String
        let cap: String
        let img: String?
    }
    struct State: Codable, Equatable {
        var added: [Entry]
        var removed: [String]
    }

    /// Posted (main thread) whenever extras change the pools.
    static let changed = Notification.Name("xiDeckExtrasChanged")
    private static let cacheKey = "xi.deckExtras.v1"

    static func cached() -> State {
        guard let data = UserDefaults.standard.data(forKey: cacheKey),
              let s = try? JSONDecoder().decode(State.self, from: data) else {
            return State(added: [], removed: [])
        }
        return s
    }

    /// Fetch the doc; if it differs from the cache, persist and apply live.
    static func refresh() async {
        guard let snap = try? await Firestore.firestore()
            .collection("xi").document("deckExtras").getDocument(),
              snap.exists, let data = snap.data() else { return }
        let added: [Entry] = ((data["added"] as? [[String: Any]]) ?? []).compactMap {
            guard let id = $0["id"] as? String, !id.isEmpty else { return nil }
            return Entry(id: id, cap: $0["cap"] as? String ?? "", img: $0["img"] as? String)
        }
        let fresh = State(added: added, removed: (data["removed"] as? [String]) ?? [])
        guard fresh != cached() else { return }
        if let enc = try? JSONEncoder().encode(fresh) {
            UserDefaults.standard.set(enc, forKey: cacheKey)
        }
        await MainActor.run { XIDeck.applyExtras(fresh) }
    }

    // A Versus doc referencing a pool index we don't have yet means another
    // player has newer extras — refresh once rather than dropping the card.
    private static var staleRefreshInFlight = false
    static func noteStaleIndex() {
        guard !staleRefreshInFlight else { return }
        staleRefreshInFlight = true
        Task {
            await refresh()
            staleRefreshInFlight = false
        }
    }
}
