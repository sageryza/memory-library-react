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
    /// The `?i=` invite token that came with a Versus link, if any — claims a
    /// tracked invite seat when joining.
    @Published var pendingVersusInviteToken: String?

    /// Pull the (kind, id, invite token) out of a universal link. Returns nil
    /// for links we don't own. kind is "share" or "versus".
    static func parse(_ url: URL) -> (kind: String, id: String, token: String?)? {
        guard let host = url.host, host.contains("incaseofamnesia.com") else { return nil }
        let parts = url.pathComponents.filter { $0 != "/" }   // e.g. ["versus", "abc123"]
        guard parts.count >= 2 else { return nil }
        let id = parts[1].trimmingCharacters(in: .whitespaces)
        guard !id.isEmpty else { return nil }
        let token = URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?.first { $0.name == "i" }?.value
        switch parts[0] {
        case "share", "x", "s": return ("share", id, nil)   // /s/ = snapshot-preview share links
        case "versus", "v": return ("versus", id, token)
        default: return nil
        }
    }

    /// Handle a universal-link URL; returns true if it was ours.
    @discardableResult
    func handle(_ url: URL) -> Bool {
        guard let (kind, id, token) = Self.parse(url) else { return false }
        if kind == "versus" {
            pendingVersusInviteToken = token
            pendingVersusGameId = id
        } else {
            pendingShareId = id
        }
        return true
    }
}
