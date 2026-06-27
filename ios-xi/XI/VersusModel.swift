import Foundation

// Faithful Swift port of src/xi/versusModel.js — pure XI Versus game logic
// (no Firebase). The board is a 5×5 checkerboard stored as a FLAT list of placed
// cells (Firestore forbids nested arrays). Events on cream cells (r+c even),
// twists on white cells, so every orthogonal adjacency is an event×twist pair.

/// One placed card on the versus board.
struct VersusPlaced: Equatable, Hashable {
    let r: Int
    let c: Int
    let d: String      // "be" event / "bw" twist
    let i: Int
    var by: String?    // uid of the player who placed it
    var color: String? // their hex color
}

/// A card in a hand or the draw pile.
struct HandCard: Equatable, Hashable {
    let d: String
    let i: Int
}

enum VersusModel {
    static let BR = 5
    static let BC = 5

    /// Distinct player colors, assigned by join order.
    static let playerColors = [
        "#c0392b", "#2e86de", "#27ae60", "#8e44ad",
        "#e67e22", "#16a085", "#d81b60", "#34495e",
    ]

    static func cellIsEvent(_ r: Int, _ c: Int) -> Bool { (r + c) % 2 == 0 }
    static func deckOf(isEvent: Bool) -> String { isEvent ? "be" : "bw" }
    static func inBounds(_ r: Int, _ c: Int) -> Bool { r >= 0 && r < BR && c >= 0 && c < BC }

    static func neighbors(_ r: Int, _ c: Int) -> [(Int, Int)] {
        [(r - 1, c), (r + 1, c), (r, c - 1), (r, c + 1)].filter { inBounds($0.0, $0.1) }
    }

    /// Seed a fresh board: one event at the centre (2,2) plus its four twist
    /// neighbours; the rest of the pools become the shuffled draw pile.
    /// (Seeding is random — the result is persisted to Firestore and shared, so
    /// it needn't be deterministic across platforms.)
    static func seedBoard(eventCount: Int, twistCount: Int) -> (placed: [VersusPlaced], drawPile: [HandCard]) {
        let evIdx = Array(0..<eventCount).shuffled()
        let twIdx = Array(0..<twistCount).shuffled()

        let cr = 2, cc = 2
        var placed: [VersusPlaced] = [VersusPlaced(r: cr, c: cc, d: "be", i: evIdx[0], by: nil, color: nil)]
        for (k, nb) in neighbors(cr, cc).enumerated() where k < twIdx.count {
            placed.append(VersusPlaced(r: nb.0, c: nb.1, d: "bw", i: twIdx[k], by: nil, color: nil))
        }

        var pile: [HandCard] = []
        for k in 1..<evIdx.count { pile.append(HandCard(d: "be", i: evIdx[k])) }
        if twIdx.count > 4 { for k in 4..<twIdx.count { pile.append(HandCard(d: "bw", i: twIdx[k])) } }
        return (placed, pile.shuffled())
    }

    static func grid(_ placed: [VersusPlaced]) -> [[VersusPlaced?]] {
        var g = Array(repeating: Array<VersusPlaced?>(repeating: nil, count: BC), count: BR)
        for p in placed where inBounds(p.r, p.c) { g[p.r][p.c] = p }
        return g
    }

    /// A card may be placed at (r,c) when the cell is empty, its kind matches the
    /// card's pool, and it touches at least one already-placed card.
    static func canPlace(_ placed: [VersusPlaced], _ r: Int, _ c: Int, _ card: HandCard) -> Bool {
        guard inBounds(r, c) else { return false }
        let g = grid(placed)
        if g[r][c] != nil { return false }
        if deckOf(isEvent: cellIsEvent(r, c)) != card.d { return false }
        return neighbors(r, c).contains { g[$0.0][$0.1] != nil }
    }

    static func legalCells(_ placed: [VersusPlaced], _ card: HandCard) -> [(Int, Int)] {
        var cells: [(Int, Int)] = []
        for r in 0..<BR { for c in 0..<BC where canPlace(placed, r, c, card) { cells.append((r, c)) } }
        return cells
    }

    /// Every orthogonally-adjacent event×twist pairing on the board (each once),
    /// as (eventCell, twistCell) — the targets for a story.
    static func adjacentPairs(_ placed: [VersusPlaced]) -> [(event: VersusPlaced, twist: VersusPlaced)] {
        let g = grid(placed)
        var pairs: [(VersusPlaced, VersusPlaced)] = []
        for r in 0..<BR {
            for c in 0..<BC {
                guard let cell = g[r][c] else { continue }
                for (a, b) in [(r, c + 1), (r + 1, c)] where inBounds(a, b) {
                    guard let other = g[a][b] else { continue }
                    let ev = cell.d == "be" ? cell : other
                    let tw = cell.d == "bw" ? cell : other
                    if ev.d == "be" && tw.d == "bw" { pairs.append((ev, tw)) }
                }
            }
        }
        return pairs
    }

    static func isBoardFull(_ placed: [VersusPlaced]) -> Bool { placed.count >= BR * BC }
}

/// SwiftUI Color from a "#rrggbb" hex string.
extension HandCard {
    var key: String { "\(d):\(i)" }
}
