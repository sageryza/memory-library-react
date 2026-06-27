import SwiftUI

enum Theme {
    static let paper = Color(red: 0.957, green: 0.937, blue: 0.902) // #f4efe6
    static let card = Color(red: 1.0, green: 0.992, blue: 0.973)    // #fffdf8
    static let gold = Color(red: 0.831, green: 0.686, blue: 0.216)  // #d4af37
    static let ink = Color(red: 0.18, green: 0.165, blue: 0.149)
    static let line = Color(red: 0.847, green: 0.804, blue: 0.706)  // #d8cdb4
    static let muted = Color(red: 0.70, green: 0.655, blue: 0.55)

    // Soft browns from the web preview: dates (#5a5043), captions (#463f35).
    static let dateInk = Color(red: 0.353, green: 0.314, blue: 0.263)
    static let captionInk = Color(red: 0.275, green: 0.247, blue: 0.208)
    // The tan ruled writing line (#e3d8bf) and the date underline (#ddd0b3).
    static let ruled = Color(red: 0.890, green: 0.847, blue: 0.749)
    static let dateUnderline = Color(red: 0.867, green: 0.816, blue: 0.702)
    // Serif UI text color (#6b531f-ish brown the web buttons use).
    static let serifInk = Color(red: 0.54, green: 0.43, blue: 0.23)

    // Bundled Google fonts (registered at launch) — matches the web preview.
    static let handwriting = "Caveat"        // dates + captions
    static let serif = "Cormorant Garamond"  // buttons + small UI
}
