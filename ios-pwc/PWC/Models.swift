import Foundation

// =============================================================================
// Models — the shapes the club's Firestore documents take in the app.
//
// The website (thepeoplewatchingclub.com) writes the same collections, so the
// field names here mirror its JS exactly:
//   observations: body, location, weather, authorName, createdBy, createdAt
//   events:       title, date, time, location, city, zip, description, type
//   rsvps:        eventTitle, email
// The app adds a `neighborhood` field to observations; unknown fields are
// ignored by the website's renderer, so both clients stay compatible.
// =============================================================================

/// A field note — "a sighting" in the app, an "observation" in Firestore.
/// Codable so the last-loaded feed can be cached on disk and shown offline.
struct Sighting: Identifiable, Equatable, Codable {
    let id: String
    let handle: String          // authorName on the document
    let note: String            // body
    let place: String           // location — often empty on website posts
    let neighborhood: String
    let createdAt: Date
    var nods: Int               // local reactions, see FeedStore
    var pending: Bool = false   // written locally, not yet accepted by the server

    var ago: String {
        let minutes = Int(Date().timeIntervalSince(createdAt) / 60)
        switch minutes {
        case ..<1:     return "now"
        case ..<60:    return "\(minutes)m"
        case ..<1440:  return "\(minutes / 60)h"
        default:       return "\(minutes / 1440)d"
        }
    }

    init(id: String, handle: String, note: String, place: String, neighborhood: String,
         createdAt: Date, nods: Int = 0, pending: Bool = false) {
        self.id = id
        self.handle = handle
        self.note = note
        self.place = place
        self.neighborhood = neighborhood
        self.createdAt = createdAt
        self.nods = nods
        self.pending = pending
    }

    init?(_ doc: FireDoc) {
        guard let body = doc.string("body"), !body.isEmpty else { return nil }
        self.init(id: doc.id,
                  handle: doc.string("authorName").flatMap { $0.isEmpty ? nil : $0 } ?? "Anonymous",
                  note: body,
                  place: doc.string("location") ?? "",
                  neighborhood: doc.string("neighborhood") ?? "",
                  createdAt: doc.date("createdAt") ?? .distantPast)
    }
}

/// A note the app has accepted from the user but not yet handed to Firestore.
/// Kept on disk so a post is never lost to a dropped connection or a relaunch.
struct PendingNote: Codable, Identifiable, Equatable {
    let id: String
    let note: String
    let place: String
    let neighborhood: String
    let handle: String
    let createdAt: Date

    var sighting: Sighting {
        Sighting(id: id, handle: handle, note: note, place: place,
                 neighborhood: neighborhood, createdAt: createdAt, pending: true)
    }

    var fields: [String: FireValue] {
        [
            "body": .string(note),
            "location": .string(place),
            "weather": .string(""),
            "neighborhood": .string(neighborhood),
            "authorName": .string(handle),
            "createdBy": .null,
            "createdAt": .timestamp(createdAt),
        ]
    }
}

/// An in-person meetup.
struct PWCEvent: Identifiable, Equatable {
    let id: String
    let title: String
    let place: String           // location
    let neighborhood: String    // city
    let zip: String
    let type: String            // "public" | "private"
    let details: String
    let start: Date?

    var isPrivate: Bool { type == "private" }

    var weekday: String { start.map { Self.format($0, "EEE") } ?? "" }
    var dayNumber: String { start.map { Self.format($0, "d") } ?? "" }
    var monthAbbrev: String { start.map { Self.format($0, "MMM") } ?? "" }
    /// 12-hour with am/pm — the club never writes 24-hour time.
    var timeText: String {
        start.map { Self.format($0, "h:mm a").lowercased() } ?? ""
    }

    private static func format(_ date: Date, _ pattern: String) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = pattern
        return f.string(from: date)
    }

    init(id: String, title: String, place: String, neighborhood: String, zip: String = "",
         type: String = "public", details: String = "", start: Date?) {
        self.id = id
        self.title = title
        self.place = place
        self.neighborhood = neighborhood
        self.zip = zip
        self.type = type
        self.details = details
        self.start = start
    }

    init?(_ doc: FireDoc) {
        guard let title = doc.string("title"), !title.isEmpty else { return nil }
        self.init(id: doc.id,
                  title: title,
                  place: doc.string("location") ?? "",
                  neighborhood: doc.string("city") ?? "",
                  zip: doc.string("zip") ?? "",
                  type: doc.string("type") ?? "public",
                  details: doc.string("description") ?? "",
                  start: Self.parse(date: doc.string("date"), time: doc.string("time")))
    }

    /// The website stores the day as "YYYY-MM-DD" and the time as "HH:MM",
    /// both in the poster's local time.
    static func parse(date: String?, time: String?) -> Date? {
        guard let date, !date.isEmpty else { return nil }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        let clock = (time?.isEmpty == false) ? time! : "00:00"
        f.dateFormat = "yyyy-MM-dd HH:mm"
        return f.date(from: "\(date) \(clock)")
    }
}

/// Sample meetups, shown only when the `events` collection is empty — the same
/// fallback the website uses so the two never disagree about an empty state.
enum Mock {
    static var events: [PWCEvent] {
        let day = { (offset: Int, hour: Int, minute: Int) -> Date? in
            Calendar.current.date(bySettingHour: hour, minute: minute, second: 0,
                                  of: Date().addingTimeInterval(Double(offset) * 86_400))
        }
        return [
            PWCEvent(id: "sample-1", title: "Sunday Watch & Walk", place: "Echo Park Lake",
                     neighborhood: "Echo Park", details: "Bring coffee. We sit by the water and compare notes at the end.",
                     start: day(3, 16, 0)),
            PWCEvent(id: "sample-2", title: "Café Stakeout (silent)", place: "La La Land Café",
                     neighborhood: "Silver Lake", details: "No talking. Two hours, window seats, short debrief.",
                     start: day(6, 10, 0)),
        ]
    }
}
