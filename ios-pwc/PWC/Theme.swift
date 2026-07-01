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

    // Cream content cards (stand apart from the navy field), with dark ink.
    static let cardBg  = Color(hex: 0xF2EAD6)   // parchment card surface
    static let cardInk = Color(hex: 0x1E2436)   // primary dark text on cream
    static let cardSub = Color(hex: 0x7C7360)   // muted secondary on cream
    static let cardLine = Color(hex: 0xE3D9C0)  // subtle warm border

    /// Brand wordmark / display — Cormorant Garamond, the website's serif.
    /// (Registered at launch in PWCApp; falls back to system serif if missing.)
    static func display(_ size: CGFloat, _ weight: Font.Weight = .bold) -> Font {
        let name: String
        switch weight {
        case .black, .heavy, .bold:     name = "CormorantGaramond-Bold"
        case .semibold:                 name = "CormorantGaramond-SemiBold"
        case .medium:                   name = "CormorantGaramond-Medium"
        default:                        name = "CormorantGaramond-Regular"
        }
        return .custom(name, size: size)
    }

    /// Cormorant Garamond for body serif text (scales with Dynamic Type).
    static func serif(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        display(size, weight)
    }
    /// Field-log data: places, times, handles.
    static func mono(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }
}

/// The elegant page masthead used across screens — serif wordmark, a thin gold
/// hairline, and an optional wide-tracked subtitle. Matches the website's hero.
struct PWCMasthead: View {
    let title: String
    var subtitle: String? = nil

    var body: some View {
        VStack(spacing: 8) {
            Text(title.uppercased())
                .font(PWC.display(24)).tracking(5)
                .foregroundStyle(PWC.accent).multilineTextAlignment(.center)
            if let subtitle {
                Text(subtitle.uppercased())
                    .font(PWC.mono(10)).tracking(2).foregroundStyle(PWC.sage)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 20).padding(.bottom, 10)
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
