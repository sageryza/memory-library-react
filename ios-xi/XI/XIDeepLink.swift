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
    /// Invite tokens by game id, kept until a join actually claims the seat.
    /// The pending token above is consumed by the lobby's auto-join — but that
    /// join can fail (not signed in yet) or never run (the user taps "join
    /// this game" later, from the game screen). Holding the token here means
    /// any successful join can still claim the tracked seat.
    var versusInviteTokens: [String: String] = [:]

    /// Pull the (kind, id, invite token) out of a universal link or an
    /// xi:// scheme link. Returns nil for links we don't own. kind is
    /// "share" or "versus".
    static func parse(_ url: URL) -> (kind: String, id: String, token: String?)? {
        var parts: [String]
        if url.scheme == "xi" {
            // The app's own scheme — xi://versus/{id}?i={token}. The web game
            // page's "Open in the XI app" button sends these; they work even
            // from in-app browsers (Gmail's) where universal links don't fire.
            // URL parsing puts the kind in `host` and the id in the path.
            parts = [url.host].compactMap { $0 } + url.pathComponents.filter { $0 != "/" }
        } else {
            guard let host = url.host, host.contains("incaseofamnesia.com") else { return nil }
            parts = url.pathComponents.filter { $0 != "/" }   // e.g. ["versus", "abc123"]
            // Tolerate the website's long form /xi/versus/{id} (old turn-alert
            // emails used it) — drop the "xi" prefix and parse the rest as usual.
            if parts.first == "xi" { parts.removeFirst() }
        }
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
            if let token, !token.isEmpty { versusInviteTokens[id] = token }
            pendingVersusInviteToken = token
            pendingVersusGameId = id
        } else {
            pendingShareId = id
        }
        return true
    }
}
