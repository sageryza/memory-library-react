import Foundation

/// Ambient "other people" for the Today and Daily screens — seeded personas that
/// write memories so the app never feels empty and you can see how others took
/// the same cards. This is DISPLAY-ONLY social proof: nothing here is ever saved
/// to your Commons (only real friends land there). A mix of first names and
/// "anonymous", as if some opted into a name and some didn't.
enum XIRobots {
    static let names = [
        "Ana", "Mara", "Devin", "Jules", "Sam", "Priya", "Noor", "Eli",
        "Rae", "Tomas", "June", "Kai", "Lena", "Marcus", "Wren", "Ivo",
    ]

    /// Short, evocative fragments general enough to sit under any card pair.
    static let snippets = [
        "i almost didn't, and then i did",
        "the version of me that said yes",
        "we never talked about it again",
        "it was smaller than i remember and somehow bigger",
        "i keep coming back to the way the light was",
        "nobody warned me it would feel like this",
        "the last good hour before everything changed",
        "i was so sure, which is the funny part",
        "it took years to understand what that meant",
        "i'd do it again, all of it, exactly the same",
        "the room went quiet and i finally heard myself",
        "half brave, half terrified, all in",
        "i wrote it down so i wouldn't lose it",
        "the door was open the whole time",
        "we were young and it showed",
        "i said too much and meant every word",
        "the year i stopped waiting",
        "it wasn't the plan, it was better",
    ]

    struct RobotMemory: Identifiable {
        let id: String
        let author: String     // a first name, or "anonymous"
        let text: String
        var isAnonymous: Bool { author == "anonymous" }
    }

    /// A stable string hash (Swift's `hashValue` is randomized per launch, which
    /// would reshuffle these every time — this doesn't).
    private static func stableHash(_ s: String) -> Int {
        var h = 5381
        for b in s.utf8 { h = ((h << 5) &+ h) &+ Int(b) }
        return abs(h)
    }

    /// Deterministic seeded memories for a card pair — stable per pairKey so they
    /// don't churn on every redraw. Roughly half are named, half anonymous.
    static func memories(for pairKey: String, count: Int = 3) -> [RobotMemory] {
        guard !pairKey.isEmpty else { return [] }
        let seed = stableHash(pairKey)
        var out: [RobotMemory] = []
        for k in 0..<count {
            let text = snippets[(seed / (k + 1) + k * 7) % snippets.count]
            let named = ((seed >> (k + 1)) & 1) == 0
            let author = named ? names[(seed / (k + 3) + k * 5) % names.count] : "anonymous"
            out.append(RobotMemory(id: "\(pairKey)-\(k)", author: author, text: text))
        }
        return out
    }

    /// A stable "others collected today" count — varies by day so it feels alive,
    /// but is deterministic within a day.
    static func othersCollectedToday(day: Int) -> Int {
        40 + abs(day &* 37) % 260
    }

    /// A stable "people played today" count for the Daily board.
    static func playedToday(day: Int) -> Int {
        60 + abs(day &* 53) % 340
    }
}
