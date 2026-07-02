import SwiftUI

/// A completed quest posted to the gallery.
struct Submission: Identifiable, Codable, Equatable {
    var id = UUID()
    var questTitle: String
    var story: String
    var imageData: Data?       // local copy; the Hall feed carries its own blob
    var username: String
    var avatar: String
    var ts: Double
    var reactions: Int
}

/// Local game state, persisted to UserDefaults so XP/streak survive a restart
/// (the original in-memory backend reset every time — this doesn't).
@MainActor
final class GameState: ObservableObject {
    static let avatars = ["🧙‍♂️", "🧙‍♀️", "🧝", "🧝‍♀️", "🦹", "🦸‍♀️", "🧛", "🧟", "🥷", "🤖", "👽", "🐸", "🐉", "🦄", "🍄", "🧍"]

    @Published var xp: Int = 0
    @Published var streak: Int = 0
    @Published var activeQuestId: Int?
    @Published var acceptedAt: Date?
    @Published var lastCompletedDay: Int?
    @Published var mySubmissions: [Submission] = []
    // Hero identity shown on Hall posts. Defaults are random so posting works
    // with zero setup; editable from the hero card on Home.
    @Published var username: String = "npc_no_\(Int.random(in: 1000...9999))"
    @Published var avatar: String = GameState.avatars.randomElement()!
    // postId → reaction key ("laugh"/"mind"/"clap") — one reaction per post.
    @Published var reacted: [String: String] = [:]
    // Matchmaking city (from the location popup or typed by hand).
    @Published var city: String = ""

    var level: Int { xp / 1000 + 1 }
    var xpIntoLevel: Int { xp % 1000 }
    var didTodayQuest: Bool { lastCompletedDay == Int(Date().timeIntervalSince1970 / 86_400) }

    private let key = "sidequest.state.v1"

    init() { load() }

    func accept(_ q: Quest) { activeQuestId = q.id; acceptedAt = Date(); save() }
    func abandon() { activeQuestId = nil; acceptedAt = nil; save() }

    func setHero(username: String, avatar: String) {
        let name = username.trimmingCharacters(in: .whitespacesAndNewlines)
        if !name.isEmpty { self.username = String(name.prefix(20)) }
        self.avatar = avatar
        save()
    }

    func setReaction(postId: String, to key: String?) {
        reacted[postId] = key
        save()
    }

    func setCity(_ name: String) {
        city = name
        save()
    }

    /// XP for party quests — no streak/daily bookkeeping, just the points.
    func award(xp amount: Int) {
        xp += amount
        save()
    }

    /// Seconds remaining on the active quest, or nil if none.
    func remaining(for q: Quest) -> Int? {
        guard activeQuestId == q.id, let start = acceptedAt else { return nil }
        return max(0, q.timeLimit - Int(Date().timeIntervalSince(start)))
    }

    func complete(_ q: Quest, story: String, image: Data?) {
        xp += q.xp
        let today = Int(Date().timeIntervalSince1970 / 86_400)
        streak = (lastCompletedDay == today - 1) ? streak + 1 : 1
        lastCompletedDay = today
        mySubmissions.insert(
            Submission(questTitle: q.title, story: story, imageData: image,
                       username: username, avatar: avatar, ts: Date().timeIntervalSince1970, reactions: 0),
            at: 0)
        activeQuestId = nil; acceptedAt = nil
        save()
    }

    // MARK: persistence
    private struct Snapshot: Codable {
        var xp: Int; var streak: Int; var activeQuestId: Int?; var acceptedAt: Date?
        var lastCompletedDay: Int?; var mySubmissions: [Submission]
        var username: String?; var avatar: String?; var reacted: [String: String]?
        var city: String?
    }
    private func save() {
        let s = Snapshot(xp: xp, streak: streak, activeQuestId: activeQuestId, acceptedAt: acceptedAt,
                         lastCompletedDay: lastCompletedDay, mySubmissions: mySubmissions,
                         username: username, avatar: avatar, reacted: reacted, city: city)
        if let d = try? JSONEncoder().encode(s) { UserDefaults.standard.set(d, forKey: key) }
    }
    private func load() {
        guard let d = UserDefaults.standard.data(forKey: key),
              let s = try? JSONDecoder().decode(Snapshot.self, from: d) else {
            save()   // first launch: persist the random hero so it doesn't reroll
            return
        }
        xp = s.xp; streak = s.streak; activeQuestId = s.activeQuestId; acceptedAt = s.acceptedAt
        lastCompletedDay = s.lastCompletedDay; mySubmissions = s.mySubmissions
        if let u = s.username { username = u }
        if let a = s.avatar { avatar = a }
        reacted = s.reacted ?? [:]
        city = s.city ?? ""
    }
}
