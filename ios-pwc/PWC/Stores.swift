import Foundation

// =============================================================================
// Stores — the app's live state, backed by Firestore and Shopify.
//
// Every store follows the same shape: hold the last good data (cached on disk
// where losing it would look like content disappearing), refresh from the
// network on appear, and surface a failure without throwing away what is
// already on screen.
// =============================================================================

/// Who this device posts as. There is no sign-in — the website's field-note
/// form is open to anyone with an optional name, and the app matches that.
@MainActor
final class Identity: ObservableObject {
    @Published var handle: String { didSet { defaults.set(handle, forKey: Keys.handle) } }
    @Published var email: String { didSet { defaults.set(email, forKey: Keys.email) } }
    let memberSince: Date

    private enum Keys {
        static let handle = "pwc.handle.v1"
        static let email = "pwc.email.v1"
        static let since = "pwc.memberSince.v1"
    }
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        if let saved = defaults.object(forKey: Keys.since) as? Date {
            memberSince = saved
        } else {
            memberSince = Date()
            defaults.set(memberSince, forKey: Keys.since)
        }
        // Assigned last so every stored property is in place before the
        // `didSet` observers on these two can run.
        handle = defaults.string(forKey: Keys.handle) ?? ""
        email = defaults.string(forKey: Keys.email) ?? ""
    }

    /// What the card and the feed show. Empty stays "@you" rather than blank.
    var displayHandle: String {
        let trimmed = handle.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty { return "@you" }
        return trimmed.hasPrefix("@") ? trimmed : "@" + trimmed
    }

    /// What gets written to `authorName`, matching the website's default.
    var authorName: String {
        let trimmed = handle.trimmingCharacters(in: .whitespaces)
        return trimmed.isEmpty ? "Anonymous" : trimmed
    }
}

// MARK: - Feed

@MainActor
final class FeedStore: ObservableObject {
    @Published private(set) var sightings: [Sighting] = []
    @Published private(set) var isLoading = false
    @Published private(set) var offline = false

    /// Notes accepted from the user but not yet written to Firestore. They live
    /// on disk and are retried on every refresh, so a post survives a dropped
    /// connection, backgrounding, or the app being terminated.
    private var pending: [PendingNote] = []
    private var remote: [Sighting] = []
    private var nods: [String: Int] = [:]

    private enum Keys {
        static let pending = "pwc.pendingNotes.v1"
        static let cache = "pwc.feedCache.v1"
        static let nods = "pwc.nods.v1"
    }
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        pending = Self.decode([PendingNote].self, defaults, Keys.pending) ?? []
        remote = Self.decode([Sighting].self, defaults, Keys.cache) ?? []
        nods = defaults.dictionary(forKey: Keys.nods) as? [String: Int] ?? [:]
        rebuild()
    }

    var totalNods: Int { nods.values.reduce(0, +) }

    func refresh() async {
        isLoading = true
        defer { isLoading = false }
        await flushPending()
        do {
            let docs = try await Firestore.list("observations", orderBy: "createdAt",
                                                descending: true, limit: 100)
            remote = docs.compactMap(Sighting.init)
            Self.encode(remote, defaults, Keys.cache)
            offline = false
        } catch {
            offline = true
        }
        rebuild()
    }

    /// Accepts a note immediately — it appears in the feed and is on disk before
    /// this returns. The network write happens after, and retries until it lands.
    func post(note: String, place: String, neighborhood: String, as author: String) {
        let item = PendingNote(id: "pending-\(UUID().uuidString)", note: note, place: place,
                               neighborhood: neighborhood, handle: author, createdAt: Date())
        pending.append(item)
        savePending()
        rebuild()
        Task { await refresh() }
    }

    func nod(_ id: String) {
        nods[id, default: 0] += 1
        defaults.set(nods, forKey: Keys.nods)
        if let i = sightings.firstIndex(where: { $0.id == id }) {
            sightings[i].nods = nods[id] ?? 0
        }
    }

    private func flushPending() async {
        guard !pending.isEmpty else { return }
        var remaining: [PendingNote] = []
        for item in pending {
            do {
                try await Firestore.create("observations", fields: item.fields)
            } catch {
                remaining.append(item)   // keep it and try again next refresh
            }
        }
        pending = remaining
        savePending()
    }

    private func rebuild() {
        let combined = pending.map(\.sighting) + remote
        sightings = combined.map { s in
            var copy = s
            copy.nods = nods[s.id] ?? 0
            return copy
        }
    }

    private func savePending() { Self.encode(pending, defaults, Keys.pending) }

    private static func encode<T: Encodable>(_ value: T, _ defaults: UserDefaults, _ key: String) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        defaults.set(data, forKey: key)
    }
    private static func decode<T: Decodable>(_ type: T.Type, _ defaults: UserDefaults, _ key: String) -> T? {
        guard let data = defaults.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }
}

// MARK: - Events

@MainActor
final class EventsStore: ObservableObject {
    @Published private(set) var events: [PWCEvent] = []
    @Published private(set) var isLoading = false
    @Published private(set) var usingSamples = false
    @Published private(set) var rsvped: Set<String> = []

    private enum Keys {
        static let rsvped = "pwc.rsvped.v1"
        static let cache = "pwc.eventsCache.v1"
    }
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        rsvped = Set(defaults.stringArray(forKey: Keys.rsvped) ?? [])
        events = Mock.events
        usingSamples = true
    }

    var next: PWCEvent? { events.first }

    func refresh() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let docs = try await Firestore.list("events", orderBy: "date", descending: true, limit: 100)
            let all = docs.compactMap(PWCEvent.init)
            let upcoming = all
                .filter { event in
                    guard let start = event.start else { return true }
                    return start >= Calendar.current.startOfDay(for: Date())
                }
                .sorted { ($0.start ?? .distantFuture) < ($1.start ?? .distantFuture) }

            // Same fallback the website uses: show samples only when there is
            // genuinely nothing scheduled.
            events = upcoming.isEmpty ? Mock.events : upcoming
            usingSamples = upcoming.isEmpty
        } catch {
            // Keep whatever is already on screen.
        }
    }

    /// Records a real RSVP. The website's RSVP button is only a visual
    /// placeholder, so this is the first one that reaches the club — the
    /// `onNewRsvp` Cloud Function emails it on.
    func rsvp(to event: PWCEvent, email: String) async throws {
        try await Firestore.create("rsvps", fields: [
            "eventTitle": .string(event.title),
            "eventId": .string(event.id),
            "email": .string(email),
            "createdAt": .timestamp(Date()),
        ])
        rsvped.insert(event.id)
        defaults.set(Array(rsvped), forKey: Keys.rsvped)
    }

    func hasRSVPd(_ event: PWCEvent) -> Bool { rsvped.contains(event.id) }
}

// MARK: - Shop

@MainActor
final class ShopStore: ObservableObject {
    @Published private(set) var products: [ShopProduct] = []
    @Published private(set) var isLoading = false
    @Published private(set) var failed = false

    func refresh() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let fetched = try await Shopify.products()
            if !fetched.isEmpty { products = fetched }
            failed = fetched.isEmpty && products.isEmpty
        } catch {
            failed = products.isEmpty
        }
    }
}
