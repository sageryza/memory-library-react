import SwiftUI
import UIKit
import Combine
import CryptoKit

/// Drawings kept on this phone, so a drawing shows instantly on later launches
/// and works offline. They live in Caches, not Documents: the files are copies
/// of permanent URLs, so they shouldn't ride along in iCloud backups, and if
/// iOS clears them to make room a drawing simply downloads again. Kept under
/// ~300 MB, oldest first out.
enum DoodleCache {
    static let maxBytes = 300 * 1024 * 1024
    private static let trimTo = 250 * 1024 * 1024
    private static let io = DispatchQueue(label: "com.sageryza.miracles.doodle-cache", qos: .utility)
    private static var writesSinceTrim = 0   // only touched on `io`

    /// In memory too, so re-created views (page turns) show the drawing on the
    /// very first frame without touching disk.
    static let memory: NSCache<NSString, UIImage> = {
        let cache = NSCache<NSString, UIImage>()
        cache.totalCostLimit = 120 * 1024 * 1024
        return cache
    }()

    static let dir: URL = {
        let fm = FileManager.default
        let folder = fm.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("doodleCache", isDirectory: true)
        try? fm.createDirectory(at: folder, withIntermediateDirectories: true)
        // Earlier builds kept these in Documents (backed up to iCloud). Carry
        // them over once, then remove the old folder.
        let old = fm.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("doodleCache", isDirectory: true)
        if let names = try? fm.contentsOfDirectory(atPath: old.path) {
            for name in names {
                let source = old.appendingPathComponent(name)
                do {
                    try fm.moveItem(at: source, to: folder.appendingPathComponent(name))
                } catch {
                    try? fm.removeItem(at: source)   // already here
                }
            }
            try? fm.removeItem(at: old)
        }
        return folder
    }()

    /// A short SHA-256 of the URL names the file. (Base64 of the full Firebase
    /// URL blew past the 255-character filename limit, so nothing ever cached.)
    /// Each redraw has its own URL, so a cached file never goes stale.
    static func fileURL(for key: String) -> URL {
        let digest = SHA256.hash(data: Data(key.utf8))
        let name = digest.map { String(format: "%02x", $0) }.joined()
        return dir.appendingPathComponent(name)
    }

    static func image(for key: String) -> UIImage? {
        if let img = memory.object(forKey: key as NSString) { return img }
        let file = fileURL(for: key)
        guard let data = try? Data(contentsOf: file), let img = UIImage(data: data) else { return nil }
        remember(img, for: key)
        io.async {
            // Recently used: trimming removes older drawings first.
            try? FileManager.default.setAttributes([.modificationDate: Date()], ofItemAtPath: file.path)
        }
        return img
    }

    static func store(_ data: Data, image: UIImage, for key: String) {
        remember(image, for: key)
        try? data.write(to: fileURL(for: key), options: .atomic)
        io.async {
            writesSinceTrim += 1
            if writesSinceTrim >= 20 {
                writesSinceTrim = 0
                trim()
            }
        }
    }

    static func trimSoon() {
        io.async { trim() }
    }

    /// Settings → delete: forget every drawing on this phone.
    static func clearAll() {
        memory.removeAllObjects()
        io.sync {
            let fm = FileManager.default
            if let names = try? fm.contentsOfDirectory(atPath: dir.path) {
                for name in names { try? fm.removeItem(at: dir.appendingPathComponent(name)) }
            }
        }
    }

    private static func remember(_ img: UIImage, for key: String) {
        let pixels = Int(img.size.width * img.scale * img.size.height * img.scale)
        memory.setObject(img, forKey: key as NSString, cost: max(1, pixels * 4))
    }

    /// Past the cap, remove the least recently used drawings down to ~250 MB.
    private static func trim() {
        let fm = FileManager.default
        let keys: Set<URLResourceKey> = [.isRegularFileKey, .fileSizeKey, .contentModificationDateKey]
        guard let files = try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: Array(keys)) else {
            return
        }
        var total = 0
        var entries: [(url: URL, size: Int, date: Date)] = []
        for file in files {
            guard let values = try? file.resourceValues(forKeys: keys), values.isRegularFile == true else {
                continue
            }
            let size = values.fileSize ?? 0
            total += size
            entries.append((url: file, size: size, date: values.contentModificationDate ?? .distantPast))
        }
        guard total > maxBytes else { return }
        for entry in entries.sorted(by: { $0.date < $1.date }) {
            if total <= trimTo { break }
            try? fm.removeItem(at: entry.url)
            total -= entry.size
        }
    }
}

/// Loads a drawing URL through `DoodleCache`. On a failed download with nothing
/// cached it offers "Try again", which downloads again — it never draws again.
@MainActor
final class DoodleImageLoader: ObservableObject {
    enum LoadState { case loading, image(UIImage), failed }
    @Published private(set) var state: LoadState = .loading
    private var current: String?

    func load(_ urlString: String) async {
        current = urlString
        if let img = DoodleCache.image(for: urlString) {
            state = .image(img)
            return
        }
        guard let url = URL(string: urlString) else { state = .failed; return }
        state = .loading
        do {
            let (data, response) = try await URLSession.shared.data(from: url)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode),
                  let img = UIImage(data: data) else {
                if current == urlString { state = .failed }
                return
            }
            DoodleCache.store(data, image: img, for: urlString)
            // She may have flipped to another option while this downloaded.
            if current == urlString { state = .image(img) }
        } catch {
            // Turning the page or flipping options cancels the download, and
            // URLSession reports that as URLError(.cancelled), not
            // CancellationError. That's not a broken drawing: leave the state
            // alone and the next appearance loads it again.
            if Self.isCancellation(error) || Task.isCancelled { return }
            if current == urlString { state = .failed }
        }
    }

    nonisolated static func isCancellation(_ error: Error) -> Bool {
        if error is CancellationError { return true }
        if let urlError = error as? URLError, urlError.code == .cancelled { return true }
        return false
    }
}

struct CachedDoodleImage: View {
    let urlString: String
    /// What VoiceOver reads for the drawing (its caption).
    var label: String = "Drawing"
    /// VoiceOver's double-tap on the drawing (shows its controls).
    var onActivate: () -> Void = {}
    @StateObject private var loader = DoodleImageLoader()

    var body: some View {
        content
            // Reload whenever the URL changes (a redraw produces a new URL),
            // and on every reappearance — a failed load recovers by itself.
            .task(id: urlString) { await loader.load(urlString) }
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
                if case .failed = loader.state { retry() }
            }
    }

    @ViewBuilder private var content: some View {
        switch loader.state {
        case .loading:
            ProgressView().tint(Theme.gold)
        case .image(let ui):
            Image(uiImage: ui)
                .resizable()
                .scaledToFit()
                .accessibilityLabel(label)
                .accessibilityAddTraits(.isButton)
                .accessibilityAction { onActivate() }
        case .failed:
            Button(action: retry) {
                VStack(spacing: 4) {
                    Image(systemName: "arrow.clockwise")
                    Text("Try again").font(.custom(Theme.serif, size: 13))
                }
                .foregroundStyle(Theme.serifInk)
                .padding(10)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("The drawing didn't load. Try again")
        }
    }

    private func retry() {
        Task { await loader.load(urlString) }
    }
}
