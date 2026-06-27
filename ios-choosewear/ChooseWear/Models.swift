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
    var image: UIImage? { UIImage(data: imageData) }
}

/// The model's customizable mannequin.
struct Figure: Codable, Equatable {
    var skin = 1          // index into ClosetStore.skinTones
    var hair = 0          // index into ClosetStore.hairStyles
    var hairColor = 0     // index into ClosetStore.hairColors
}
