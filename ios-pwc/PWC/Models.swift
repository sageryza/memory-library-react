import Foundation

/// A live "watching now" sighting — the pulse of the club.
struct Sighting: Identifiable {
    let id = UUID()
    let handle: String      // member handle, e.g. "@quietobserver"
    let note: String        // "by the window at La La Land 👀"
    let place: String       // venue
    let neighborhood: String
    let minutesAgo: Int
    var nods: Int           // "nods" = reactions
    let watchingHere: Int   // how many members reported here recently

    var ago: String { minutesAgo == 0 ? "now" : "\(minutesAgo)m" }
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
