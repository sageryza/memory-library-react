import SwiftUI

/// The corner map of the whole constellation canvas: a dot per memory (crimson)
/// and per concept pin (gold), with a blue rectangle showing the part of the
/// board currently on screen. Tap or drag anywhere on it to jump the view
/// there. Toggleable from the board's ••• menu.
struct BoardMinimap: View {
    let canvasSize: CGSize
    let memoryDots: [CGPoint]
    let pinDots: [CGPoint]
    let viewport: CGRect
    let zoom: CGFloat
    var onJump: (CGPoint) -> Void

    private static let maxW: CGFloat = 132
    private static let maxH: CGFloat = 168

    var body: some View {
        let scale = min(Self.maxW / max(canvasSize.width, 1), Self.maxH / max(canvasSize.height, 1))
        let w = canvasSize.width * scale
        let h = canvasSize.height * scale

        ZStack(alignment: .topLeading) {
            RoundedRectangle(cornerRadius: 6)
                .fill(Color.white.opacity(0.94))
            ForEach(Array(memoryDots.enumerated()), id: \.offset) { _, p in
                Circle().fill(Color(red: 0.862, green: 0.078, blue: 0.235))
                    .frame(width: 4, height: 4)
                    .position(x: p.x * scale, y: p.y * scale)
            }
            ForEach(Array(pinDots.enumerated()), id: \.offset) { _, p in
                Circle().fill(XITheme.gold)
                    .frame(width: 4, height: 4)
                    .position(x: p.x * scale, y: p.y * scale)
            }
            // Where you are.
            Rectangle()
                .stroke(Color(red: 0.16, green: 0.42, blue: 0.85), lineWidth: 1.2)
                .frame(width: max(6, viewport.width * scale), height: max(6, viewport.height * scale))
                .position(x: (viewport.midX) * scale, y: (viewport.midY) * scale)
        }
        .frame(width: w, height: h)
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .overlay(RoundedRectangle(cornerRadius: 6).stroke(XITheme.line, lineWidth: 0.75))
        .overlay(alignment: .bottomTrailing) {
            Text("\(Int((zoom * 100).rounded()))%")
                .font(.system(size: 9, design: .monospaced))
                .foregroundStyle(XITheme.navInk)
                .padding(.horizontal, 4).padding(.vertical, 2)
        }
        .shadow(color: .black.opacity(0.12), radius: 3, y: 1)
        .contentShape(Rectangle())
        // Tap to jump; keep dragging to steer the viewport continuously.
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { v in
                    onJump(CGPoint(x: v.location.x / scale, y: v.location.y / scale))
                }
        )
        .accessibilityLabel("Board minimap")
    }
}
