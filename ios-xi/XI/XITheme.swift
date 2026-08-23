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
    static let surface = Color(red: 255 / 255, green: 253 / 255, blue: 246 / 255) // #fffdf6 card surface
    // #cacaca — GRAY, where the artboard drew #d9c9a6, a warm tan that read as
    // gold beside the cream (Sophie, Aug 2026: "the cards and the memories and
    // the text box are all outlined in gold, but instead they should be
    // outlined in gray"). Same lightness as the tan it replaces, so nothing
    // got heavier or lighter — it finishes the sweep that took the gilt off
    // `mark`, `rule` and `cardLine` and left every OUTLINE behind.
    static let lightLine = Color(red: 202 / 255, green: 202 / 255, blue: 202 / 255) // all outlines

    // Aug 2026, Sophie: "get rid of most of the gold and red accents so change
    // them to black or gray. keep the gold progress bar tho." So `gilt`
    // survives on ONE element — the fill bar — and everything the artboard
    // drew in gilt or oxblood reads through these three neutrals instead.
    static let mark = ink                 // was oxblood: the small-caps labels, the lozenge
    static let rule = ink.opacity(0.35)   // was gilt: the hairline rules
    static let cardLine = ink.opacity(0.3) // was gilt: the picture's edge inside the plate

    /// The corner radius of the page's outer frame — the artboard's 2pt, the
    /// softest possible round. Shared so the boxes inside the page (the write
    /// box, the collected cards, the save button) carry the same corner as the
    /// frame around them (Sophie, Aug 2026) and can't drift apart from it.
    static let corner: CGFloat = 2

    /// The double frame's inner edge. The 1px rule sits at inset 14, so a
    /// scrolling page inset by this much is clipped one point inside it and
    /// vanishes AT the line instead of sliding past it. Content keeps the
    /// artboard's page margins by measuring from here (30 - frameInset).
    static let frameInset: CGFloat = 15

    /// Bundled Google fonts (see Resources/Fonts + Info.plist UIAppFonts).
    /// Fixed sizes on purpose — the artboard is the spec.
    static func marcellus(_ size: CGFloat) -> Font { .custom("Marcellus-Regular", fixedSize: size) }
    static func garamond(_ size: CGFloat) -> Font { .custom("EBGaramond-Regular", fixedSize: size) }
    static func garamondItalic(_ size: CGFloat) -> Font { .custom("EBGaramond-Italic", fixedSize: size) }
}
