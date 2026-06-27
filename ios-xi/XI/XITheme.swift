import SwiftUI

enum XITheme {
    static let paper = Color(red: 0.957, green: 0.937, blue: 0.902) // parchment bg
    static let cream = Color(red: 0.972, green: 0.933, blue: 0.843) // event cells
    static let white = Color.white                                  // twist cells
    static let ink = Color(red: 0.18, green: 0.165, blue: 0.149)
    static let line = Color(red: 0.80, green: 0.74, blue: 0.62)
    static let gold = Color(red: 0.69, green: 0.55, blue: 0.21)

    /// Card art (/xi-cards/*.webp) is served from the production hosting.
    static let cardArtBase = "https://incaseofamnesia.com"
}
