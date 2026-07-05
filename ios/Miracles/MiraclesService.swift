import Foundation
import FirebaseAuth
import FirebaseFunctions

/// Thin wrapper over the reused backend: anonymous auth + the `illustrateMiracle`
/// Cloud Function (Opus 4.8 distill → Replicate draw → permanent Storage URL).
@MainActor
final class MiraclesService {
    static let shared = MiraclesService()

    private lazy var functions = Functions.functions()

    func ensureSignedIn() async throws {
        if Auth.auth().currentUser == nil {
            try await Auth.auth().signInAnonymously()
        }
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
