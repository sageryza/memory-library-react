import SwiftUI
import CryptoKit

/// Disk + memory cache for the SAGEDIAGRAM drawings.
///
/// `AsyncImage` goes through the shared `URLCache`, which is only ~10MB on disk
/// and is bypassed entirely when Storage serves the file with `no-cache` — so
/// the grid re-downloaded every drawing on every launch. This keeps the bytes
/// in Caches/ keyed by a stable hash of the URL (Swift's `hashValue` is seeded
/// per-process, so it can't be used for a filename that must survive a relaunch).
@MainActor
final class DrawingImageCache {
    static let shared = DrawingImageCache()

    private let mem = NSCache<NSString, UIImage>()
    private let dir: URL

    private init() {
        let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        dir = base.appendingPathComponent("drawing-images", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        mem.countLimit = 400
    }

    private func key(_ url: String) -> String {
        SHA256.hash(data: Data(url.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    /// Already-cached image, if any — memory first, then disk. No network.
    func cached(_ url: String) -> UIImage? {
        let k = key(url)
        if let img = mem.object(forKey: k as NSString) { return img }
        guard let data = try? Data(contentsOf: dir.appendingPathComponent(k)),
              let img = UIImage(data: data) else { return nil }
        mem.setObject(img, forKey: k as NSString)
        return img
    }

    /// Cached image, or download it and cache it.
    func load(_ url: String) async -> UIImage? {
        if let img = cached(url) { return img }
        guard let u = URL(string: url),
              let (data, _) = try? await URLSession.shared.data(from: u),
              let img = UIImage(data: data) else { return nil }
        try? data.write(to: dir.appendingPathComponent(key(url)), options: .atomic)
        mem.setObject(img, forKey: key(url) as NSString)
        return img
    }
}

/// Drop-in replacement for the `AsyncImage` the drawing grids used, backed by
/// `DrawingImageCache` so a drawing is fetched once and then loads instantly.
struct CachedDrawingImage: View {
    let url: String
    @State private var image: UIImage?
    @State private var failed = false

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image).resizable().scaledToFit()
            } else if failed {
                Image(systemName: "photo").foregroundColor(.gray)
            } else {
                ProgressView()
            }
        }
        .task(id: url) {
            if image != nil { return }
            if let hit = DrawingImageCache.shared.cached(url) { image = hit; return }
            if let fetched = await DrawingImageCache.shared.load(url) { image = fetched }
            else { failed = true }
        }
    }
}
