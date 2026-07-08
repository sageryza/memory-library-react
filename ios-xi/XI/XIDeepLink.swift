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
    /// The game id from a `/versus/{id}` or `/v/{id}` link, awaiting handling.
    @Published var pendingVersusGameId: String?

    /// Pull the (kind, id) out of a universal link. Returns nil for links we
    /// don't own. kind is "share" or "versus".
    static func parse(_ url: URL) -> (kind: String, id: String)? {
        guard let host = url.host, host.contains("incaseofamnesia.com") else { return nil }
        let parts = url.pathComponents.filter { $0 != "/" }   // e.g. ["versus", "abc123"]
        guard parts.count >= 2 else { return nil }
        let id = parts[1].trimmingCharacters(in: .whitespaces)
        guard !id.isEmpty else { return nil }
        switch parts[0] {
        case "share", "x": return ("share", id)
        case "versus", "v": return ("versus", id)
        default: return nil
        }
    }

    /// Handle a universal-link URL; returns true if it was ours.
    @discardableResult
    func handle(_ url: URL) -> Bool {
        guard let (kind, id) = Self.parse(url) else { return false }
        if kind == "versus" { pendingVersusGameId = id } else { pendingShareId = id }
        return true
    }
}
