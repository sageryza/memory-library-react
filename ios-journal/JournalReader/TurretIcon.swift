import SwiftUI

/// Custom crenellated-turret glyph used in the bottom nav (no SF Symbol exists
/// for it). Drawn in a 24×24 design space and scaled to fit, so it lines up with
/// the 20pt SF Symbols beside it. Stroke only — tint it with `.foregroundStyle`
/// and vary `lineWidth` for the inactive/active states, mirroring the
/// regular/semibold weight swap the SF-Symbol tabs use.
struct TurretShape: Shape {
    /// Stroke width expressed in 24-unit design space (matches the SVG source).
    var designLineWidth: CGFloat = 1.25

    func path(in rect: CGRect) -> Path {
        let s = min(rect.width, rect.height) / 24.0
        let ox = rect.midX - 12 * s
        let oy = rect.midY - 12 * s
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: ox + x * s, y: oy + y * s)
        }

        var path = Path()

        // Crenellated top (merlons)
        path.move(to: p(7, 10))
        path.addLine(to: p(7, 6));   path.addLine(to: p(9, 6))
        path.addLine(to: p(9, 7.6)); path.addLine(to: p(11, 7.6))
        path.addLine(to: p(11, 6));  path.addLine(to: p(13, 6))
        path.addLine(to: p(13, 7.6)); path.addLine(to: p(15, 7.6))
        path.addLine(to: p(15, 6));  path.addLine(to: p(17, 6))
        path.addLine(to: p(17, 10))

        // Band line under the battlements
        path.move(to: p(7, 10)); path.addLine(to: p(17, 10))

        // Side walls
        path.move(to: p(8, 10));  path.addLine(to: p(8, 21))
        path.move(to: p(16, 10)); path.addLine(to: p(16, 21))

        // Base (flush to the walls, no overhang)
        path.move(to: p(8, 21)); path.addLine(to: p(16, 21))

        // Window — rounded-top arch, floating off the base
        path.move(to: p(10.5, 17.2))
        path.addLine(to: p(10.5, 14.4))
        path.addQuadCurve(to: p(12, 12.9), control: p(10.5, 12.9))
        path.addQuadCurve(to: p(13.5, 14.4), control: p(13.5, 12.9))
        path.addLine(to: p(13.5, 17.2))

        // Window sill (same width as the window)
        path.move(to: p(10.5, 17.2)); path.addLine(to: p(13.5, 17.2))

        return path.strokedPath(
            StrokeStyle(lineWidth: designLineWidth * s, lineCap: .round, lineJoin: .round)
        )
    }
}

/// Drop-in nav icon: strokes the turret, thin when inactive and a touch heavier
/// when active, tinted by the caller's `foregroundStyle`.
struct TurretIcon: View {
    var active: Bool = false
    var body: some View {
        TurretShape(designLineWidth: active ? 1.7 : 1.25)
            .frame(width: 22, height: 22)
    }
}
