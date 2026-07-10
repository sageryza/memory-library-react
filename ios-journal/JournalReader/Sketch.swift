import SwiftUI
import CoreGraphics

/// A rounded rectangle with a hand-drawn wobble — the outline breathes in and out
/// slightly so it reads as inked by hand, not machine-perfect. Deterministic per
/// `seed`, so a given card always wobbles the same way (no jitter on redraw).
struct SketchRoundedRect: Shape {
    var cornerRadius: CGFloat = 14
    var seed: UInt64 = 1
    var wobble: CGFloat = 1.6      // max deviation, points
    var edgeSteps: Int = 5
    var cornerSteps: Int = 4

    func path(in rect: CGRect) -> Path {
        // xorshift PRNG seeded per-shape → stable, organic offsets.
        var state = seed == 0 ? 0x9E3779B9 : seed
        func next() -> CGFloat {
            state ^= state << 13; state ^= state >> 7; state ^= state << 17
            return CGFloat(Double(state % 100_000) / 100_000.0) // 0..<1
        }
        func jitter() -> CGFloat { (next() * 2 - 1) * wobble }

        let inset = wobble + 1
        let x0 = rect.minX + inset, y0 = rect.minY + inset
        let x1 = rect.maxX - inset, y1 = rect.maxY - inset
        guard x1 > x0, y1 > y0 else { return Path(rect) }
        let r = min(cornerRadius, min(x1 - x0, y1 - y0) / 2)
        let cx = (x0 + x1) / 2, cy = (y0 + y1) / 2

        var raw: [CGPoint] = []
        func edge(_ a: CGPoint, _ b: CGPoint) {
            for i in 0..<edgeSteps {
                let t = CGFloat(i) / CGFloat(edgeSteps)
                raw.append(CGPoint(x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t))
            }
        }
        func arc(_ center: CGPoint, _ a0: CGFloat, _ a1: CGFloat) {
            for i in 0..<cornerSteps {
                let a = (a0 + (a1 - a0) * CGFloat(i) / CGFloat(cornerSteps)) * .pi / 180
                raw.append(CGPoint(x: center.x + r * cos(a), y: center.y + r * sin(a)))
            }
        }
        edge(CGPoint(x: x0 + r, y: y0), CGPoint(x: x1 - r, y: y0))
        arc(CGPoint(x: x1 - r, y: y0 + r), -90, 0)
        edge(CGPoint(x: x1, y: y0 + r), CGPoint(x: x1, y: y1 - r))
        arc(CGPoint(x: x1 - r, y: y1 - r), 0, 90)
        edge(CGPoint(x: x1 - r, y: y1), CGPoint(x: x0 + r, y: y1))
        arc(CGPoint(x: x0 + r, y: y1 - r), 90, 180)
        edge(CGPoint(x: x0, y: y1 - r), CGPoint(x: x0, y: y0 + r))
        arc(CGPoint(x: x0 + r, y: y0 + r), 180, 270)

        // Push each sample slightly along its outward direction from the center.
        let pts = raw.map { p -> CGPoint in
            let dx = p.x - cx, dy = p.y - cy
            let len = max(1, (dx * dx + dy * dy).squareRoot())
            let j = jitter()
            return CGPoint(x: p.x + dx / len * j, y: p.y + dy / len * j)
        }
        guard pts.count > 2 else { return Path(rect) }

        // Smooth the loop with midpoint quad curves (each sample becomes a control
        // point) so the wobble is wavy, not jagged.
        var path = Path()
        let last = pts[pts.count - 1]
        path.move(to: CGPoint(x: (last.x + pts[0].x) / 2, y: (last.y + pts[0].y) / 2))
        for i in 0..<pts.count {
            let curr = pts[i]
            let next = pts[(i + 1) % pts.count]
            path.addQuadCurve(to: CGPoint(x: (curr.x + next.x) / 2, y: (curr.y + next.y) / 2),
                              control: curr)
        }
        path.closeSubpath()
        return path
    }
}

/// Stable seed from a string, so a tile/card's wobble is the same every launch.
func sketchSeed(_ s: String) -> UInt64 {
    s.unicodeScalars.reduce(UInt64(2166136261)) { ($0 ^ UInt64($1.value)) &* 16777619 }
}
