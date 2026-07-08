import Foundation

/// Routes an incoming universal link (a tapped incaseofamnesia.com/share/… link)
/// to the Library, which resolves the board and offers to add it to the Commons.
/// The app entry sets `pendingShareId`; XIShell switches to the Library tab and
/// LibraryView picks it up, then clears it.
@MainActor
final class XIDeepLink: ObservableObject {
    static let shared = XIDeepLink()
    private init() {}

    /// The share id from a `/share/{id}` or `/x/{id}` link, awaiting handling.
    @Published var pendingShareId: String?

    /// Pull a share id out of a universal link. Returns nil for links we don't own.
    static func shareId(from url: URL) -> String? {
        guard let host = url.host, host.contains("incaseofamnesia.com") else { return nil }
        let parts = url.pathComponents.filter { $0 != "/" }   // e.g. ["share", "abc123"]
        guard parts.count >= 2, parts[0] == "share" || parts[0] == "x" else { return nil }
        let id = parts[1].trimmingCharacters(in: .whitespaces)
        return id.isEmpty ? nil : id
    }

    /// Handle a universal-link URL; returns true if it was ours.
    @discardableResult
    func handle(_ url: URL) -> Bool {
        guard let id = Self.shareId(from: url) else { return false }
        pendingShareId = id
        return true
    }
}
