import Foundation
import FirebaseAuth
import FirebaseFunctions

/// Thin wrapper over the backend: anonymous auth, the `illustrateMiracle`
/// Cloud Function (Anthropic's Claude turns the words into a drawing idea →
/// OpenAI draws it → permanent Storage URL), and `deleteMiracleData`.
@MainActor
final class MiraclesService {
    static let shared = MiraclesService()

    private lazy var functions = Functions.functions()
    private var signingIn: Task<Void, Error>?
    /// The account "Delete my book and data" removed. It is never used again,
    /// even if signing out of it failed — nothing may be saved or drawn under it.
    private static let deletedAccountKey = "miracles.deletedAccount"

    /// Signs in anonymously if needed. Calls that overlap share one sign-in,
    /// so two can't each create an account.
    func ensureSignedIn() async throws {
        if let user = Auth.auth().currentUser {
            if user.uid != UserDefaults.standard.string(forKey: Self.deletedAccountKey) { return }
            try Auth.auth().signOut()
        }
        if let pending = signingIn { return try await pending.value }
        let task = Task<Void, Error> { _ = try await Auth.auth().signInAnonymously() }
        signingIn = task
        defer { signingIn = nil }
        try await task.value
    }

    /// Deletes the cloud book with its pages, every drawing in Storage and the
    /// account itself. Throws unless the server answers `{ ok: true }`.
    func deleteMyData() async throws {
        try await ensureSignedIn()
        guard let uid = Auth.auth().currentUser?.uid else {
            throw NSError(
                domain: "Miracles", code: -2,
                userInfo: [NSLocalizedDescriptionKey: MiraclesErrors.generic]
            )
        }
        let callable = functions.httpsCallable("deleteMiracleData")
        callable.timeoutInterval = 120
        let result = try await callable.call([String: Any]())
        let reply = result.data as? [String: Any]
        guard (reply?["ok"] as? Bool) == true else {
            throw NSError(
                domain: "Miracles", code: -2,
                userInfo: [NSLocalizedDescriptionKey: MiraclesErrors.generic]
            )
        }
        UserDefaults.standard.set(uid, forKey: Self.deletedAccountKey)
    }

    struct DrawOption {
        let url: String
        let drawing: String  // the concept text — needed to re-render at a higher tier
    }

    struct DrawResult {
        let options: [DrawOption]  // one or more concept options to pick from
        let version: String?
        var urls: [String] { options.map(\.url) }
    }

    /// One call to the backend. `tier` picks the quality rung ("fast" = mini,
    /// "better" = 1.5-low, "best" = 2-medium; nil = the original 1-medium).
    /// Pass `concept` to re-render a known concept at a higher tier without
    /// re-distilling.
    func illustrate(
        text: String, boxID: String, distill: Bool, variants: Int = 3,
        tier: String? = nil, concept: String? = nil
    ) async throws -> DrawResult {
        try await ensureSignedIn()
        let callable = functions.httpsCallable("illustrateMiracle")
        // A 3-concept draw takes longer than the client's 70s default — match
        // the server's 300s so it doesn't give up early (DEADLINE EXCEEDED).
        callable.timeoutInterval = 300
        var payload: [String: Any] = [
            "text": text,
            "id": boxID,
            "distill": distill,
            "variants": variants,
        ]
        if let tier { payload["tier"] = tier }
        if let concept { payload["concept"] = concept }
        let result = try await callable.call(payload)
        guard let data = result.data as? [String: Any] else {
            throw NSError(
                domain: "Miracles", code: -1,
                userInfo: [NSLocalizedDescriptionKey: "No image was returned."]
            )
        }
        // Prefer the full concepts list; fall back to the single primary url.
        var options: [DrawOption] = []
        if let concepts = data["concepts"] as? [[String: Any]] {
            options = concepts.compactMap { c in
                guard let url = c["url"] as? String else { return nil }
                return DrawOption(url: url, drawing: (c["drawing"] as? String) ?? "")
            }
        }
        if options.isEmpty, let url = data["url"] as? String {
            options = [DrawOption(url: url, drawing: (data["drawing"] as? String) ?? "")]
        }
        guard !options.isEmpty else {
            throw NSError(
                domain: "Miracles", code: -1,
                userInfo: [NSLocalizedDescriptionKey: "No image was returned."]
            )
        }
        return DrawResult(options: options, version: data["version"] as? String)
    }
}
