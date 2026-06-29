import SwiftUI

/// People Watching Club look — matches the website (thepeoplewatchingclub.com):
/// a dark navy "secret society" field, warm gold accent, light parchment text,
/// serif display + a monospaced touch for field-log data (places, times).
enum PWC {
    static let paper   = Color(hex: 0x0F1528)   // --bg            deep navy
    static let card    = Color(hex: 0x151D35)   // --bg-elevated
    static let ink     = Color(hex: 0xEAE6DA)   // --text-bright   primary (light) text
    static let accent  = Color(hex: 0xC9A227)   // --gold
    static let sage    = Color(hex: 0x9A9279)   // muted tan — places / secondary
    static let line    = Color(hex: 0x283153)   // --border (a touch lighter for visibility)
    static let dim     = Color(hex: 0x7A7668)   // --text-dim      tertiary
    static let onAccent = Color(hex: 0x0F1528)  // dark text to sit on the gold accent

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
