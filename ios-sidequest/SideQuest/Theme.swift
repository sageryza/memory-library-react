import SwiftUI

/// Side Quest look — retro 8-bit RPG. Press Start 2P for chunky headings/buttons,
/// VT323 for terminal body text, purple gradient + gold.
enum SQ {
    static let bgTop   = Color(hex: 0x667EEA)
    static let bgBot   = Color(hex: 0x764BA2)
    static let gold    = Color(hex: 0xFFD700)
    static let green   = Color(hex: 0x2ECC71)
    static let coral   = Color(hex: 0xFF6B6B)
    static let teal    = Color(hex: 0x4ECDC4)
    static let panel   = Color(hex: 0x2A1B47)     // dark purple panel
    static let panelHi = Color(hex: 0x3D2A63)
    static let ink     = Color.white

    static var background: LinearGradient {
        LinearGradient(colors: [bgTop, bgBot], startPoint: .top, endPoint: .bottom)
    }

    /// 8-bit display font (use small sizes — it's very wide).
    static func pixel(_ size: CGFloat) -> Font { .custom("PressStart2P-Regular", size: size) }
    /// Terminal body font (use large sizes — it's tall/narrow).
    static func term(_ size: CGFloat) -> Font { .custom("VT323-Regular", size: size) }
}

extension Color {
    init(hex: UInt) {
        self.init(red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255)
    }
}

/// A chunky pixel-bordered panel.
struct PixelPanel<Content: View>: View {
    var fill: Color = SQ.panel
    var border: Color = SQ.gold
    @ViewBuilder var content: Content
    var body: some View {
        content
            .padding(16)
            .background(fill)
            .overlay(Rectangle().stroke(border, lineWidth: 3))
    }
}

/// A retro action button.
struct PixelButton: ButtonStyle {
    var bg: Color
    var fg: Color = .white
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(SQ.pixel(12))
            .padding(.vertical, 14).padding(.horizontal, 18)
            .frame(maxWidth: .infinity)
            .background(bg)
            .foregroundStyle(fg)
            .overlay(Rectangle().stroke(.black.opacity(0.35), lineWidth: 3))
            .opacity(configuration.isPressed ? 0.75 : 1)
            .offset(y: configuration.isPressed ? 2 : 0)
    }
}
