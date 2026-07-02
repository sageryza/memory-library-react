import SwiftUI

/// Clothing categories. A valid outfit needs (top + bottom) OR a dress OR a jumpsuit;
/// jackets/accessories are optional.
enum Category: String, Codable, CaseIterable, Identifiable {
    case top, bottom, dress, jumpsuit, jacket, accessory
    var id: String { rawValue }
    var label: String {
        switch self {
        case .top: return "Tops"
        case .bottom: return "Bottoms"
        case .dress: return "Dresses"
        case .jumpsuit: return "Jumpsuits"
        case .jacket: return "Jackets"
        case .accessory: return "Accessories"
        }
    }
    /// Where it sits on the figure.
    enum Slot { case upper, lower, full, layer, extra }
    var slot: Slot {
        switch self {
        case .top: return .upper
        case .bottom: return .lower
        case .dress, .jumpsuit: return .full
        case .jacket: return .layer
        case .accessory: return .extra
        }
    }
}

struct ClothingItem: Identifiable, Codable, Equatable {
    var id = UUID()
    var category: Category
    var imageData: Data
    /// The original photo, kept so the item can be redrawn again. Optional for
    /// backward-compatible decoding of pre-illustration closets.
    var sourceImageData: Data?
    /// True once imageData is the AI illustration (transparent PNG) rather
    /// than the raw photo.
    var drawn: Bool?
    var image: UIImage? { UIImage(data: imageData) }
    var isDrawn: Bool { drawn == true }
}

/// Your paper-doll base figure for trying on outfits.
struct Figure: Codable, Equatable {
    var skin = 1          // legacy (old shape-mannequin) — kept so older saves decode
    var hair = 0          // legacy
    var hairColor = 0     // legacy
    /// "girl" or "boy" — which paper-doll base art to show.
    var doll: String?
    var isBoy: Bool { doll == "boy" }
}

/// A saved outfit ("look") — references closet items by id, per slot.
struct SavedLook: Identifiable, Codable, Equatable {
    var id = UUID()
    var top: UUID?
    var bottom: UUID?
    var full: UUID?        // dress or jumpsuit (covers top + bottom)
    var jacket: UUID?
    var accessory: UUID?
    var createdAt = Date()
    /// The items in this look, in display order (full first, then layers/extras).
    var itemIDs: [UUID] { [full, top, bottom, jacket, accessory].compactMap { $0 } }
}
