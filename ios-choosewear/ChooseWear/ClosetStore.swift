import SwiftUI

/// The local closet + figure, persisted to a JSON file in Documents. Single-user
/// for Phase 1; becomes per-user in Firestore/Storage in the cloud phase.
@MainActor
final class ClosetStore: ObservableObject {
    @Published var displayName: String = ""
    @Published var items: [ClothingItem] = []
    @Published var figure = Figure()
    @Published var looks: [SavedLook] = []

    // Figure palette options (plain placeholders — owner restyles).
    static let skinTones: [Color] = [
        Color(hex: 0xF3D2B3), Color(hex: 0xE3B591), Color(hex: 0xC98C63),
        Color(hex: 0x9C6644), Color(hex: 0x6B4226),
    ]
    static let hairColors: [Color] = [
        Color(hex: 0x2B2B2B), Color(hex: 0x6B4423), Color(hex: 0xC9A14A), Color(hex: 0xB04632),
    ]
    static let hairStyles = ["Short", "Long", "Bun", "Bald"]

    private var url: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("closet.json")
    }

    init() { load() }

    func items(in category: Category) -> [ClothingItem] { items.filter { $0.category == category } }

    func add(_ image: UIImage, category: Category) {
        guard let data = Self.compress(image) else { return }
        items.insert(ClothingItem(category: category, imageData: data), at: 0)
        save()
    }

    func remove(_ item: ClothingItem) {
        items.removeAll { $0.id == item.id }
        save()
    }

    func item(_ id: UUID) -> ClothingItem? { items.first { $0.id == id } }

    // MARK: saved looks
    func saveLook(top: UUID?, bottom: UUID?, full: UUID?, jacket: UUID?, accessory: UUID?) {
        looks.insert(SavedLook(top: top, bottom: bottom, full: full,
                               jacket: jacket, accessory: accessory), at: 0)
        save()
    }
    func removeLooks(at offsets: IndexSet) { looks.remove(atOffsets: offsets); save() }

    /// Downscale to max 800px and JPEG-compress to keep storage small (per the spec).
    static func compress(_ image: UIImage, maxDim: CGFloat = 800, quality: CGFloat = 0.5) -> Data? {
        let scale = min(1, maxDim / max(image.size.width, image.size.height))
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let r = UIGraphicsImageRenderer(size: size)
        let resized = r.image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
        return resized.jpegData(compressionQuality: quality)
    }

    // MARK: persistence
    private struct Snapshot: Codable {
        var displayName: String; var items: [ClothingItem]; var figure: Figure
        var looks: [SavedLook]?   // optional for backward-compatible decoding
    }
    private func save() {
        let snap = Snapshot(displayName: displayName, items: items, figure: figure, looks: looks)
        if let d = try? JSONEncoder().encode(snap) { try? d.write(to: url) }
    }
    func persist() { save() }
    private func load() {
        guard let d = try? Data(contentsOf: url),
              let s = try? JSONDecoder().decode(Snapshot.self, from: d) else { return }
        displayName = s.displayName; items = s.items; figure = s.figure; looks = s.looks ?? []
    }
}

extension Color {
    init(hex: UInt) {
        self.init(red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255)
    }
}
