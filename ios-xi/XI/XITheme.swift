import SwiftUI

enum XITheme {
    static let paper = Color(red: 0.957, green: 0.937, blue: 0.902) // parchment bg (#F1E9D8-ish)
    static let cream = Color(red: 0.972, green: 0.933, blue: 0.843) // event cells
    static let white = Color.white                                  // twist cells
    static let ink = Color(red: 0.18, green: 0.165, blue: 0.149)
    static let line = Color(red: 0.80, green: 0.74, blue: 0.62)
    static let gold = Color(red: 0.69, green: 0.55, blue: 0.21)

    // Web XI signature palette (matches the web app).
    static let maroon = Color(red: 0.502, green: 0.0, blue: 0.125)   // #800020 — primary accent / tokens
    static let archiveCard = Color(red: 0.980, green: 0.973, blue: 0.914) // #FAF8E9 memory cards
    static let archiveBorder = Color(red: 0.878, green: 0.878, blue: 0.878) // #E0E0E0
    static let archiveTitle = Color(red: 0.184, green: 0.310, blue: 0.310)  // #2F4F4F
    static let archiveBody = Color(red: 0.290, green: 0.290, blue: 0.290)   // #4A4A4A

    // Shared bottom-nav palette (matches the web XiNavBar).
    static let navBg = Color(red: 0.953, green: 0.918, blue: 0.851)     // #F3EAD9
    static let navBorder = Color(red: 0.847, green: 0.804, blue: 0.714) // #D8CDB6
    static let navInk = Color(red: 0.541, green: 0.490, blue: 0.431)    // #8A7D6E inactive

    /// Card art (/xi-cards/*.webp) is served from the production hosting.
    static let cardArtBase = "https://incaseofamnesia.com"
}

/// The settled "2a" design language from design/xi-redesign ("deco tarot,
/// refined") — exact values from the Claude Design artboard. Today wears it
/// now; the other screens keep the old XITheme palette until their directions
/// are picked, so these are ADDITIONS, not a retune of the constants above.
enum XiDeco {
    static let cream = Color(red: 248 / 255, green: 241 / 255, blue: 227 / 255)   // #f8f1e3 background
    static let ink = Color(red: 25 / 255, green: 20 / 255, blue: 17 / 255)        // #191411
    static let gilt = Color(red: 176 / 255, green: 140 / 255, blue: 54 / 255)     // #b08c36
    static let oxblood = Color(red: 110 / 255, green: 20 / 255, blue: 35 / 255)   // #6e1423
    static let surface = Color(red: 255 / 255, green: 253 / 255, blue: 246 / 255) // #fffdf6 card surface
    static let lightLine = Color(red: 217 / 255, green: 201 / 255, blue: 166 / 255) // #d9c9a6 all outlines
    static let navGold = Color(red: 229 / 255, green: 184 / 255, blue: 75 / 255)  // #e5b84b active nav icon
    static let navDim = Color(red: 244 / 255, green: 234 / 255, blue: 214 / 255).opacity(0.5) // inactive nav icon

    /// Bundled Google fonts (see Resources/Fonts + Info.plist UIAppFonts).
    /// Fixed sizes on purpose — the artboard is the spec.
    static func marcellus(_ size: CGFloat) -> Font { .custom("Marcellus-Regular", fixedSize: size) }
    static func garamond(_ size: CGFloat) -> Font { .custom("EBGaramond-Regular", fixedSize: size) }
    static func garamondItalic(_ size: CGFloat) -> Font { .custom("EBGaramond-Italic", fixedSize: size) }
}
