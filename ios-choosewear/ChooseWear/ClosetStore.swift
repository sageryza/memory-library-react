import SwiftUI

/// The local closet + figure, persisted to a JSON file in Documents. Single-user
/// for Phase 1; becomes per-user in Firestore/Storage in the cloud phase.
@MainActor
final class ClosetStore: ObservableObject {
    @Published var displayName: String = ""
    @Published var items: [ClothingItem] = []
    @Published var figure = Figure()
    @Published var looks: [SavedLook] = []
    /// Items being redrawn as illustrations right now (not persisted).
    @Published var drawing: Set<UUID> = []

    private var url: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("closet.json")
    }

    init() { load() }

    func items(in category: Category) -> [ClothingItem] { items.filter { $0.category == category } }

    func add(_ image: UIImage, category: Category, draw: Bool = true) {
        guard let data = Self.compress(image) else { return }
        let item = ClothingItem(category: category, imageData: data, sourceImageData: data)
        items.insert(item, at: 0)
        save()
        if draw { self.draw(item.id) }
    }

    /// Redraw an item's photo as a hand-drawn illustration (transparent PNG)
    /// via the backend. The photo stays visible until the drawing arrives;
    /// on failure the item just keeps its photo and "Redraw" stays available.
    func draw(_ id: UUID) {
        guard let item = item(id), !drawing.contains(id) else { return }
        let source = item.sourceImageData ?? item.imageData
        drawing.insert(id)
        Task {
            if let png = try? await AIService.drawItem(source, category: item.category),
               let ui = UIImage(data: png),
               let small = Self.shrinkPNG(Self.trimmedToAlpha(ui)),
               let idx = items.firstIndex(where: { $0.id == id }) {
                items[idx].imageData = small
                items[idx].drawn = true
                save()
            }
            drawing.remove(id)
        }
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

    /// Crop a drawn illustration to its visible (non-transparent) pixels, so
    /// garments size and anchor predictably when layered on the doll.
    static func trimmedToAlpha(_ image: UIImage) -> UIImage {
        guard let cg = image.cgImage else { return image }
        let w = cg.width, h = cg.height
        guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8,
                                  bytesPerRow: w, space: CGColorSpaceCreateDeviceGray(),
                                  bitmapInfo: CGImageAlphaInfo.alphaOnly.rawValue),
              w > 0, h > 0 else { return image }
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
        guard let data = ctx.data else { return image }
        let alpha = data.bindMemory(to: UInt8.self, capacity: w * h)
        var minX = w, minY = h, maxX = -1, maxY = -1
        for y in 0..<h {
            for x in 0..<w where alpha[y * w + x] > 16 {
                if x < minX { minX = x }
                if x > maxX { maxX = x }
                if y < minY { minY = y }
                if y > maxY { maxY = y }
            }
        }
        guard maxX >= minX, maxY >= minY,
              let cropped = cg.cropping(to: CGRect(x: minX, y: minY,
                                                   width: maxX - minX + 1, height: maxY - minY + 1))
        else { return image }
        return UIImage(cgImage: cropped)
    }

    /// Downscale a drawn illustration keeping its transparency.
    static func shrinkPNG(_ image: UIImage, maxDim: CGFloat = 800) -> Data? {
        let scale = min(1, maxDim / max(image.size.width, image.size.height))
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let format = UIGraphicsImageRendererFormat()
        format.opaque = false
        format.scale = 1
        return UIGraphicsImageRenderer(size: size, format: format)
            .image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
            .pngData()
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
