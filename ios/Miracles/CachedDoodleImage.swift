import SwiftUI
import UIKit
import CryptoKit

/// Loads a drawing URL and caches the bytes on disk, so a drawing shows
/// instantly on later launches, works offline, and survives even if the remote
/// URL ever dies. On a failed load with no cache it shows a "tap to redraw"
/// affordance instead of spinning forever.
@MainActor
final class DoodleImageLoader: ObservableObject {
    enum LoadState { case loading, image(UIImage), failed }
    @Published var state: LoadState = .loading

    // Persistent (not the eviction-prone Caches dir) so cached doodles outlive
    // any remote URL expiry — that's the whole point of caching here.
    private static let dir: URL = {
        let base = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let d = base.appendingPathComponent("doodleCache", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }()

    private func fileURL(for key: String) -> URL {
        // Name the cache file by a short SHA-256 hash of the URL. (Base64 of the
        // full Firebase URL blew past the filesystem's 255-char filename limit,
        // so every write silently failed and nothing ever cached.) A fixed
        // 64-char hex name is stable per URL and always well under the limit —
        // and since each redraw has a unique URL, the cache never goes stale.
        let digest = SHA256.hash(data: Data(key.utf8))
        let name = digest.map { String(format: "%02x", $0) }.joined()
        return Self.dir.appendingPathComponent(name)
    }

    func load(_ urlString: String) async {
        let cacheFile = fileURL(for: urlString)
        if let data = try? Data(contentsOf: cacheFile), let img = UIImage(data: data) {
            state = .image(img)
            return
        }
        guard let url = URL(string: urlString) else { state = .failed; return }
        state = .loading
        do {
            let (data, resp) = try await URLSession.shared.data(from: url)
            guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode),
                  let img = UIImage(data: data) else {
                state = .failed
                return
            }
            try? data.write(to: cacheFile, options: .atomic)
            state = .image(img)
        } catch {
            state = .failed
        }
    }
}

struct CachedDoodleImage: View {
    let urlString: String
    var onRetry: () -> Void
    @StateObject private var loader = DoodleImageLoader()

    var body: some View {
        Group {
            switch loader.state {
            case .loading:
                ProgressView().tint(Theme.gold)
            case .image(let ui):
                Image(uiImage: ui).resizable().scaledToFit()
            case .failed:
                Button(action: onRetry) {
                    VStack(spacing: 4) {
                        Image(systemName: "arrow.clockwise")
                        Text("tap to redraw").font(.custom(Theme.serif, size: 13))
                    }
                    .foregroundStyle(Theme.serifInk)
                }
                .buttonStyle(.plain)
            }
        }
        // Reload whenever the URL changes (a redraw produces a new URL).
        .task(id: urlString) { await loader.load(urlString) }
    }
}
