import SwiftUI

enum Difficulty: String {
    case trivial = "TRIVIAL", moderate = "MODERATE", absurd = "ABSURD", legendary = "LEGENDARY"
    var color: Color {
        switch self {
        case .trivial: return SQ.green
        case .moderate: return SQ.teal
        case .absurd: return SQ.gold
        case .legendary: return SQ.coral
        }
    }
}

struct Quest: Identifiable, Equatable {
    let id: Int
    let title: String
    let description: String
    let difficulty: Difficulty
    let timeLimit: Int          // seconds
    let timeLimitDisplay: String
    let xp: Int
}

enum Quests {
    static let all: [Quest] = [
        .init(id: 0, title: "The Watermelon Child",
              description: "Adopt a watermelon, stroll it in a stroller or cart, and introduce it to 3 strangers.",
              difficulty: .absurd, timeLimit: 7200, timeLimitDisplay: "2 hours", xp: 250),
        .init(id: 1, title: "Reverse Shopping",
              description: "Place items FROM your bag onto store shelves, then leave without buying anything.",
              difficulty: .legendary, timeLimit: 3600, timeLimitDisplay: "1 hour", xp: 500),
        .init(id: 2, title: "Sock Diplomat",
              description: "Wear mismatched socks and invent backstories for why they can't get along.",
              difficulty: .trivial, timeLimit: 86400, timeLimitDisplay: "All day", xp: 100),
        .init(id: 3, title: "Invisible Pet Walk",
              description: "Walk an invisible pet on a leash. Stop at crosswalks. Clean up after it.",
              difficulty: .absurd, timeLimit: 1800, timeLimitDisplay: "30 min", xp: 200),
        .init(id: 4, title: "Compliment Archaeology",
              description: "Give historically accurate compliments to strangers (\"Your tunic would make Caesar jealous!\").",
              difficulty: .moderate, timeLimit: 3600, timeLimitDisplay: "1 hour", xp: 150),
        .init(id: 5, title: "Formal Grocery Shopping",
              description: "Do your regular grocery shopping in full formal wear. Act like it's completely normal.",
              difficulty: .legendary, timeLimit: 3600, timeLimitDisplay: "1 hour", xp: 400),
        .init(id: 6, title: "Cloud Documentarian",
              description: "Spend 30 minutes naming clouds and writing a \"scientific\" report on them.",
              difficulty: .trivial, timeLimit: 1800, timeLimitDisplay: "30 min", xp: 100),
        .init(id: 7, title: "Plant Therapy Session",
              description: "Have a deep, public conversation with a houseplant about your problems.",
              difficulty: .moderate, timeLimit: 900, timeLimitDisplay: "15 min", xp: 150),
        .init(id: 8, title: "The Floor is Lava Champion",
              description: "Cross a public space without touching the floor. Document your route.",
              difficulty: .absurd, timeLimit: 1800, timeLimitDisplay: "30 min", xp: 300),
        .init(id: 9, title: "Backwards Day",
              description: "Walk backwards everywhere for 30 minutes. \"I'm rewinding my day to fix a mistake.\"",
              difficulty: .moderate, timeLimit: 1800, timeLimitDisplay: "30 min", xp: 200),
    ]

    /// Today's quest — deterministic from the date (no server cron needed).
    /// Everyone gets the same quest each day; it rotates through all 10.
    static func today(_ date: Date = Date()) -> Quest {
        let day = Int(date.timeIntervalSince1970 / 86_400)
        return all[((day % all.count) + all.count) % all.count]
    }

    /// Co-op quests for matched parties (ids 100+ so they never clash with the
    /// solo pool). One is picked at random when a party forms.
    static let partyPool: [Quest] = [
        .init(id: 100, title: "Mirror Strangers",
              description: "Walk side by side mirroring each other's movements EXACTLY for one full block. Renegotiate at crosswalks.",
              difficulty: .moderate, timeLimit: 3600, timeLimitDisplay: "1 hour", xp: 300),
        .init(id: 101, title: "The Handoff",
              description: "Pass a mysterious package between you in the most conspicuous spy fashion possible. Repeat until someone notices.",
              difficulty: .absurd, timeLimit: 3600, timeLimitDisplay: "1 hour", xp: 350),
        .init(id: 102, title: "Two-Headed Tourist",
              description: "Be tourists who believe every mundane object is a famous landmark. Photograph each other admiring a parking meter.",
              difficulty: .moderate, timeLimit: 5400, timeLimitDisplay: "90 min", xp: 300),
        .init(id: 103, title: "The Longest Introduction",
              description: "Take turns introducing each other to strangers with increasingly elaborate fake backstories. Never break.",
              difficulty: .legendary, timeLimit: 3600, timeLimitDisplay: "1 hour", xp: 500),
        .init(id: 104, title: "Statue Buddies",
              description: "Freeze as a two-person statue in a public place. Switch poses only when nobody's looking.",
              difficulty: .absurd, timeLimit: 1800, timeLimitDisplay: "30 min", xp: 350),
        .init(id: 105, title: "Parade of Two",
              description: "Hold a parade. There are two of you. Commit completely — wave at your public.",
              difficulty: .legendary, timeLimit: 3600, timeLimitDisplay: "1 hour", xp: 450),
        .init(id: 106, title: "Duel of Compliments",
              description: "Compliment-battle each other in public, escalating in volume and sincerity, until a stranger reacts.",
              difficulty: .moderate, timeLimit: 1800, timeLimitDisplay: "30 min", xp: 300),
        .init(id: 107, title: "Synchronized Bench",
              description: "Sit on a bench in perfect synchronization — cross legs, sigh, check invisible watches. One block of choreography.",
              difficulty: .trivial, timeLimit: 1800, timeLimitDisplay: "30 min", xp: 200),
    ]

    static func partyQuest(_ id: Int) -> Quest {
        partyPool.first { $0.id == id } ?? partyPool[0]
    }
}
