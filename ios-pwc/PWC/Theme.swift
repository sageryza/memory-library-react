import SwiftUI

/// People Watching Club look — a "field club for observing humans": warm paper,
/// ink, one bold red-orange accent, a sage tag color, and a monospaced touch for
/// the live/field-log data (places, timestamps).
enum PWC {
    static let paper  = Color(hex: 0xF3EFE6)
    static let card   = Color(hex: 0xFBF9F3)
    static let ink    = Color(hex: 0x1C1A17)
    static let accent = Color(hex: 0xE2503C)   // signal red-orange
    static let sage   = Color(hex: 0x6B7257)   // muted field green (tags/places)
    static let line   = Color(hex: 0xDAD2C4)
    static let dim     = Color(hex: 0x8C8473)

    /// Brand wordmark / display.
    static func display(_ size: CGFloat, _ weight: Font.Weight = .bold) -> Font {
        .system(size: size, weight: weight, design: .serif)
    }
    /// Field-log data: places, times, handles.
    static func mono(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }
}

extension Color {
    init(hex: UInt) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }
}
