import Foundation

// Faithful Swift port of the web XI "Board of the Day" engine
// (src/xi/boardOfDayModel.js + versusModel helpers + boardAffinity).
// Determinism is exact: same day number → same board as the web app.
// Verified against bundled golden vectors (see BoardEngine.verifyGolden()).

// MARK: - Models

struct XICard: Decodable, Identifiable, Equatable {
    let id: String
    let cap: String
    let img: String?
    /// Which of the five named decks the card comes from (midjourney / internet
    /// / dreams / claude / chatgpt) — drives the Curate deck toggles.
    let deck: String?
}

/// A placed card on the 5×5 board: row, col, deck ('be' event / 'bw' twist), index into the pool.
struct Placed: Equatable {
    let r: Int
    let c: Int
    let d: String   // "be" = event, "bw" = twist
    let i: Int
}

// MARK: - Deck + affinity data (bundled JSON)

enum XIDeck {
    private struct DeckFile: Decodable { let events: [XICard]; let twists: [XICard] }

    static let deck: ([XICard], [XICard]) = loadDeck()
    static var events: [XICard] { deck.0 }
    static var twists: [XICard] { deck.1 }
    /// Sparse non-BASE scores: EVENTCAP -> [TWISTCAP: score].
    static let affinity: [String: [String: Int]] = loadAffinity()

    static let eventCaps: [String] = deck.0.map { $0.cap }
    static let twistCaps: [String] = deck.1.map { $0.cap }

    static func loadJSON(_ name: String) -> Data {
        guard let url = Bundle.main.url(forResource: name, withExtension: "json"),
              let data = try? Data(contentsOf: url) else {
            // Bundled resource — should always be present. Assert in debug so we
            // catch a packaging mistake, but never hard-crash a shipped build.
            assertionFailure("Missing bundled resource \(name).json")
            return Data()
        }
        return data
    }

    static func loadDeck() -> ([XICard], [XICard]) {
        guard let file = try? JSONDecoder().decode(DeckFile.self, from: loadJSON("boardDeck")) else {
            assertionFailure("boardDeck.json missing or malformed")
            return ([], [])
        }
        return (file.events, file.twists)
    }

    static func loadAffinity() -> [String: [String: Int]] {
        (try? JSONDecoder().decode([String: [String: Int]].self, from: loadJSON("affinity"))) ?? [:]
    }
}

// MARK: - PRNG (mulberry32)

struct Mulberry32 {
    private var s: UInt32
    init(seed: UInt32) { s = seed == 0 ? 1 : seed }

    mutating func next() -> Double {
        s = s &+ 0x6D2B79F5
        var t = s
        t = (t ^ (t >> 15)) &* (t | 1)
        t = t ^ (t &+ ((t ^ (t >> 7)) &* (t | 61)))
        return Double(t ^ (t >> 14)) / 4294967296.0
    }
}

// MARK: - Grid helpers (5×5)

enum Grid {
    static let size = 5
    static func inBounds(_ r: Int, _ c: Int) -> Bool { r >= 0 && r < size && c >= 0 && c < size }
    /// Cream cells (even r+c) hold events; white cells hold twists.
    static func cellKindIsEvent(_ r: Int, _ c: Int) -> Bool { (r + c) % 2 == 0 }
    static func neighbors(_ r: Int, _ c: Int) -> [(Int, Int)] {
        [(r - 1, c), (r + 1, c), (r, c - 1), (r, c + 1)].filter { inBounds($0.0, $0.1) }
    }
}

func xiShuffle<T>(_ arr: [T], _ rng: inout Mulberry32) -> [T] {
    var a = arr
    var i = a.count - 1
    while i > 0 {
        let j = Int(rng.next() * Double(i + 1))
        a.swapAt(i, j)
        i -= 1
    }
    return a
}

// MARK: - Engine

enum BoardEngine {
    private static func keyOf(_ r: Int, _ c: Int) -> String { "\(r),\(c)" }

    /// Grow a connected, crossword-like cluster of `targetCards` cells out from
    /// the centre, bounded to a `side`×`side` box — so the board is a crossword
    /// (some cells left blank, different each day) that never sprawls wider than
    /// `side` and keeps the cards big.
    private static func growCluster(_ rng: inout Mulberry32, _ targetCards: Int, side: Int) -> [(Int, Int)] {
        let start = side / 2
        func inBox(_ r: Int, _ c: Int) -> Bool { r >= 0 && r < side && c >= 0 && c < side }
        var taken: Set<String> = [keyOf(start, start)]
        var cells: [(Int, Int)] = [(start, start)]
        var guardN = 0
        while cells.count < targetCards && guardN < 500 {
            guardN += 1
            var frontier: [(Int, Int)] = []
            for (r, c) in cells {
                for (dr, dc) in [(-1, 0), (1, 0), (0, -1), (0, 1)] {
                    let (a, b) = (r + dr, c + dc)
                    if inBox(a, b) && !taken.contains(keyOf(a, b)) { frontier.append((a, b)) }
                }
            }
            if frontier.isEmpty { break }
            let (r, c) = frontier[Int(rng.next() * Double(frontier.count))]
            if taken.contains(keyOf(r, c)) { continue }
            taken.insert(keyOf(r, c))
            cells.append((r, c))
        }
        return cells
    }

    private static func bfsOrder(_ cells: [(Int, Int)]) -> [(Int, Int)] {
        let inSet = Set(cells.map { keyOf($0.0, $0.1) })
        var seen: Set<String> = [keyOf(2, 2)]
        var queue: [(Int, Int)] = [(2, 2)]
        var order: [(Int, Int)] = []
        var head = 0
        while head < queue.count {
            let (r, c) = queue[head]; head += 1
            order.append((r, c))
            for (a, b) in Grid.neighbors(r, c) {
                let k = keyOf(a, b)
                if inSet.contains(k) && !seen.contains(k) { seen.insert(k); queue.append((a, b)) }
            }
        }
        for (r, c) in cells where !seen.contains(keyOf(r, c)) { order.append((r, c)) }
        return order
    }

    static func pairScore(_ eventCap: String, _ twistCap: String) -> Int {
        guard let row = XIDeck.affinity[eventCap.uppercased()] else { return 1 }
        return row[twistCap.uppercased()] ?? 1
    }

    private static func smartAssign(
        _ cells: [(Int, Int)], _ evCaps: [String], _ twCaps: [String],
        _ rng: inout Mulberry32, _ allowedEv: [Int], _ allowedTw: [Int]
    ) -> [Placed] {
        let candE = xiShuffle(allowedEv, &rng)
        let candT = xiShuffle(allowedTw, &rng)
        func scoreIdx(_ ei: Int, _ ti: Int) -> Int { pairScore(evCaps[ei], twCaps[ti]) }

        var assign: [String: (d: String, i: Int)] = [:]
        var usedE = Set<Int>()
        var usedT = Set<Int>()

        for (r, c) in bfsOrder(cells) {
            let isEvent = Grid.cellKindIsEvent(r, c)
            let pool = isEvent ? candE : candT
            let nbrs = Grid.neighbors(r, c).compactMap { assign[keyOf($0.0, $0.1)] }
            var best = -1
            var bestScore = Int.min
            for idx in pool {
                if isEvent ? usedE.contains(idx) : usedT.contains(idx) { continue }
                var s = 0
                for nb in nbrs { s += isEvent ? scoreIdx(idx, nb.i) : scoreIdx(nb.i, idx) }
                if s > bestScore { bestScore = s; best = idx }
            }
            if isEvent { usedE.insert(best) } else { usedT.insert(best) }
            assign[keyOf(r, c)] = (isEvent ? "be" : "bw", best)
        }

        // Adjacency edges (eventCellKey, twistCellKey).
        var edges: [(String, String)] = []
        for (r, c) in cells where Grid.cellKindIsEvent(r, c) {
            for (a, b) in Grid.neighbors(r, c) where assign[keyOf(a, b)] != nil && !Grid.cellKindIsEvent(a, b) {
                edges.append((keyOf(r, c), keyOf(a, b)))
            }
        }
        func total() -> Int {
            edges.reduce(0) { $0 + scoreIdx(assign[$1.0]!.i, assign[$1.1]!.i) }
        }

        let cellKeys = cells.map { keyOf($0.0, $0.1) }
        for _ in 0..<4 {
            var improved = false
            for x in 0..<cellKeys.count {
                for y in (x + 1)..<cellKeys.count {
                    guard assign[cellKeys[x]]!.d == assign[cellKeys[y]]!.d else { continue }
                    let before = total()
                    let ai = assign[cellKeys[x]]!.i
                    assign[cellKeys[x]]!.i = assign[cellKeys[y]]!.i
                    assign[cellKeys[y]]!.i = ai
                    if total() > before {
                        improved = true
                    } else {
                        let t = assign[cellKeys[x]]!.i
                        assign[cellKeys[x]]!.i = assign[cellKeys[y]]!.i
                        assign[cellKeys[y]]!.i = t
                    }
                }
            }
            if !improved { break }
        }

        return cells.map { (r, c) in
            let a = assign[keyOf(r, c)]!
            return Placed(r: r, c: c, d: a.d, i: a.i)
        }
    }

    /// An experimental small board — lays out an arbitrary set of cells so we can
    /// preview bigger cards (a cross, an L of three, a pair, …). Even-parity cells
    /// get events, odd-parity get twists, so every neighbouring pair is a valid
    /// event+twist story. Deterministic per day.
    static func layoutBoard(_ dayNum: Int, cells: [(Int, Int)]) -> [Placed] {
        let seed = UInt32(truncatingIfNeeded: Int64(dayNum + 1) &* 0x9E3779B1)
        var rng = Mulberry32(seed: seed)
        let evs = xiShuffle(Array(0..<XIDeck.eventCaps.count), &rng)
        let tws = xiShuffle(Array(0..<XIDeck.twistCaps.count), &rng)
        var ei = 0, ti = 0
        return cells.map { (r, c) in
            if Grid.cellKindIsEvent(r, c) {
                defer { ei += 1 }
                return Placed(r: r, c: c, d: "be", i: evs[ei % evs.count])
            } else {
                defer { ti += 1 }
                return Placed(r: r, c: c, d: "bw", i: tws[ti % tws.count])
            }
        }
    }

    /// The deterministic board for a given day: a SOLID 4×4 of 16 cards (bigger
    /// cards than the old grown cluster, which sprawled up to 5 wide). Optional
    /// allowed-index lists (cards still in play after Curate removals + deck
    /// toggles) narrow the draw; each axis falls back to its full pool if too
    /// few cards remain to fill it — mirroring the web's
    /// `dailyBoard(dayNum, pools, { allowedEv, allowedTw })`.
    static let dailySide = 4
    static func dailyBoard(_ dayNum: Int,
                           allowedEv: [Int]? = nil, allowedTw: [Int]? = nil) -> [Placed] {
        let seed = UInt32(truncatingIfNeeded: Int64(dayNum + 1) &* 0x9E3779B1)
        var rng = Mulberry32(seed: seed)
        // Vary how many of the 16 cells fill (10–13) so the blank pattern shifts
        // noticeably day to day instead of always leaving the same corners.
        let target = 10 + Int(rng.next() * 4)
        let cells = growCluster(&rng, target, side: dailySide)
        let evCells = cells.filter { Grid.cellKindIsEvent($0.0, $0.1) }.count
        let twCells = cells.count - evCells
        var ev = allowedEv ?? Array(0..<XIDeck.eventCaps.count)
        var tw = allowedTw ?? Array(0..<XIDeck.twistCaps.count)
        if ev.count < evCells { ev = Array(0..<XIDeck.eventCaps.count) }
        if tw.count < twCells { tw = Array(0..<XIDeck.twistCaps.count) }
        return smartAssign(cells, XIDeck.eventCaps, XIDeck.twistCaps, &rng, ev, tw)
    }

    // MARK: Day numbering

    static func dayNumber(_ date: Date = Date()) -> Int {
        let tzOffsetMs = Double(TimeZone.current.secondsFromGMT(for: date)) * 1000
        let ms = date.timeIntervalSince1970 * 1000
        return Int(floor((ms + tzOffsetMs) / 86_400_000))
    }

    static func dayLabel(_ dayNum: Int, today: Int? = nil) -> String {
        let t = today ?? dayNumber()
        if dayNum == t { return "Today" }
        if dayNum == t - 1 { return "Yesterday" }
        let ms = Double(dayNum) * 86_400_000 - Double(TimeZone.current.secondsFromGMT()) * 1000
        let d = Date(timeIntervalSince1970: ms / 1000)
        let f = DateFormatter(); f.dateFormat = "MMM d"
        return f.string(from: d)
    }

    // MARK: Verification

    private struct GoldenEntry: Decodable {
        let day: Int
        let placed: [GoldPlaced]
        struct GoldPlaced: Decodable { let r: Int; let c: Int; let d: String; let i: Int }
    }

    /// Returns nil if the Swift engine matches all bundled golden vectors,
    /// or a description of the first mismatch.
    static func verifyGolden() -> String? {
        let data = XIDeck.loadJSON("golden")
        guard let golden = try? JSONDecoder().decode([GoldenEntry].self, from: data) else {
            return "golden.json failed to decode"
        }
        for entry in golden {
            let mine = dailyBoard(entry.day)
            let expected = entry.placed.map { Placed(r: $0.r, c: $0.c, d: $0.d, i: $0.i) }
            if mine != expected {
                return "day \(entry.day): board mismatch\n expected: \(expected)\n got:      \(mine)"
            }
        }
        return nil
    }
}
