import Foundation

/// A live "watching now" sighting — the pulse of the club.
struct Sighting: Identifiable, Codable, Equatable {
    var id = UUID()
    let handle: String      // member handle, e.g. "@quietobserver"
    let note: String        // "by the window at La La Land 👀"
    let place: String       // venue
    let neighborhood: String
    let createdAt: Date     // when it was posted — the age is derived, never frozen
    var nods: Int           // "nods" = reactions
    let watchingHere: Int   // how many members reported here recently
    var isMine = false      // posted on this device, so it gets saved to disk

    /// Seed initialiser for the sample feed, which is written as "N minutes old".
    init(handle: String, note: String, place: String, neighborhood: String,
         minutesAgo: Int, nods: Int, watchingHere: Int, isMine: Bool = false) {
        self.init(handle: handle, note: note, place: place, neighborhood: neighborhood,
                  createdAt: Date().addingTimeInterval(-Double(minutesAgo) * 60),
                  nods: nods, watchingHere: watchingHere, isMine: isMine)
    }

    init(handle: String, note: String, place: String, neighborhood: String,
         createdAt: Date, nods: Int, watchingHere: Int, isMine: Bool = false) {
        self.handle = handle
        self.note = note
        self.place = place
        self.neighborhood = neighborhood
        self.createdAt = createdAt
        self.nods = nods
        self.watchingHere = watchingHere
        self.isMine = isMine
    }

    var ago: String {
        let minutes = Int(Date().timeIntervalSince(createdAt) / 60)
        switch minutes {
        case ..<1:     return "now"
        case ..<60:    return "\(minutes)m"
        case ..<1440:  return "\(minutes / 60)h"
        default:       return "\(minutes / 1440)d"
        }
    }
}

/// Owns the feed and keeps this device's own sightings on disk, so a post
/// survives the app being backgrounded, terminated by iOS, or relaunched.
/// The sample sightings are re-seeded each launch and are never saved.
@MainActor
final class SightingStore: ObservableObject {
    @Published var sightings: [Sighting] = [] { didSet { save() } }

    private let key = "pwc.mySightings.v1"
    private let defaults: UserDefaults
    private var loading = false

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        loading = true
        sightings = Self.load(from: defaults, key: key) + Mock.sightings
        loading = false
    }

    func add(note: String, place: String, neighborhood: String) {
        sightings.insert(
            Sighting(handle: "@you", note: note, place: place, neighborhood: neighborhood,
                     createdAt: Date(), nods: 0, watchingHere: 1, isMine: true),
            at: 0
        )
    }

    private static func load(from defaults: UserDefaults, key: String) -> [Sighting] {
        guard let data = defaults.data(forKey: key),
              let saved = try? JSONDecoder().decode([Sighting].self, from: data) else { return [] }
        return saved.sorted { $0.createdAt > $1.createdAt }
    }

    private func save() {
        guard !loading else { return }
        let mine = sightings.filter(\.isMine)
        guard let data = try? JSONEncoder().encode(mine) else { return }
        defaults.set(data, forKey: key)
    }
}

/// An in-person meetup — turning the feed into a community.
struct PWCEvent: Identifiable {
    let id = UUID()
    let title: String
    let place: String
    let neighborhood: String
    let day: String         // "Sun"
    let date: String        // "Jun 29 · 4:00pm"
    let going: Int
}

/// A shop item. The membership card is the silly hook — free with any purchase.
struct ShopItem: Identifiable {
    let id = UUID()
    let name: String
    let price: String
    let blurb: String
    let emoji: String
    let freeGift: Bool      // "comes with a membership card"
}

enum Mock {
    static let sightings: [Sighting] = [
        .init(handle: "@quietobserver", note: "by the window at La La Land, two men arguing about a croissant 🥐",
              place: "La La Land Café", neighborhood: "Silver Lake", minutesAgo: 0, nods: 14, watchingHere: 3),
        .init(handle: "@benchwarmer", note: "girl reading the same page for twenty minutes. respect.",
              place: "Echo Park Lake", neighborhood: "Echo Park", minutesAgo: 6, nods: 31, watchingHere: 5),
        .init(handle: "@cornerseat", note: "a man feeding pigeons like he's running a small government",
              place: "Washington Sq", neighborhood: "West Village", minutesAgo: 18, nods: 22, watchingHere: 2),
        .init(handle: "@latnight", note: "couple on a first date, both texting other people. tragic. compelling.",
              place: "Gjelina", neighborhood: "Venice", minutesAgo: 41, nods: 9, watchingHere: 1),
    ]

    static let events: [PWCEvent] = [
        .init(title: "Sunday Watch & Walk", place: "Echo Park Lake", neighborhood: "Echo Park",
              day: "Sun", date: "Jun 29 · 4:00pm", going: 12),
        .init(title: "Café Stakeout (silent)", place: "La La Land Café", neighborhood: "Silver Lake",
              day: "Wed", date: "Jul 2 · 10:00am", going: 7),
    ]

    static let shop: [ShopItem] = [
        .init(name: "The PWC Handbook", price: "$24", blurb: "The field guide to noticing.", emoji: "📓", freeGift: true),
        .init(name: "Club Cap", price: "$32", blurb: "Embroidered eye. Low brim, for discretion.", emoji: "🧢", freeGift: true),
        .init(name: "Watcher Crewneck", price: "$58", blurb: "Heavyweight. Built for long sits.", emoji: "👕", freeGift: true),
        .init(name: "PWC Bingo", price: "$12", blurb: "Spot the archetypes. First to five wins.", emoji: "🎟️", freeGift: true),
        .init(name: "Membership Card", price: "Free*", blurb: "*comes with any purchase — or grab it solo.", emoji: "🪪", freeGift: false),
    ]
}
