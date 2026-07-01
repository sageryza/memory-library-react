import SwiftUI

enum Theme {
    static let paper = Color(red: 0.957, green: 0.937, blue: 0.902) // #f4efe6
    static let card = Color(red: 1.0, green: 0.992, blue: 0.973)    // #fffdf8
    static let gold = Color(red: 0.831, green: 0.686, blue: 0.216)  // #d4af37
    static let ink = Color(red: 0.18, green: 0.165, blue: 0.149)
    static let line = Color(red: 0.78, green: 0.78, blue: 0.78)      // box borders — gray
    static let muted = Color(red: 0.70, green: 0.655, blue: 0.55)

    // Soft browns from the web preview: dates (#5a5043), captions (#463f35).
    static let dateInk = Color(red: 0.353, green: 0.314, blue: 0.263)
    static let captionInk = Color(red: 0.275, green: 0.247, blue: 0.208)
    // Ruled caption lines + date underline — gray (was tan).
    static let ruled = Color(red: 0.84, green: 0.84, blue: 0.84)
    static let dateUnderline = Color(red: 0.80, green: 0.80, blue: 0.80)
    // Serif UI text color (#6b531f-ish brown the web buttons use).
    static let serifInk = Color(red: 0.54, green: 0.43, blue: 0.23)

    // Bundled Google fonts (registered at launch) — matches the web preview.
    static let handwriting = "Caveat"        // dates + captions
    static let serif = "Cormorant Garamond"  // buttons + small UI
}

extension ComplianceTheme {
    /// Miracles look — warm paper, gold, elegant serif (readable for consent).
    static let miracles = ComplianceTheme(
        background: Theme.paper,
        card: Theme.card,
        ink: Theme.ink,
        subtleInk: Theme.dateInk,
        accent: Theme.gold,
        accentText: Theme.ink,
        line: Theme.line,
        titleFont: { Font.custom(Theme.serif, size: $0).weight(.semibold) },
        bodyFont: { Font.custom(Theme.serif, size: $0) }
    )
}
