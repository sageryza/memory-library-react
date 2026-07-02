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

    struct DrawResult {
        let urls: [String]   // one or more concept options to pick from
        let version: String?
    }

    func illustrate(text: String, boxID: String, distill: Bool, variants: Int = 3) async throws -> DrawResult {
        try await ensureSignedIn()
        let callable = functions.httpsCallable("illustrateMiracle")
        // A 3-concept draw takes longer than the client's 70s default — match
        // the server's 300s so it doesn't give up early (DEADLINE EXCEEDED).
        callable.timeoutInterval = 300
        let result = try await callable.call([
            "text": text,
            "id": boxID,
            "distill": distill,
            "variants": variants,
        ])
        guard let data = result.data as? [String: Any] else {
            throw NSError(
                domain: "Miracles", code: -1,
                userInfo: [NSLocalizedDescriptionKey: "No image was returned."]
            )
        }
        // Prefer the full concepts list; fall back to the single primary url.
        var urls: [String] = []
        if let concepts = data["concepts"] as? [[String: Any]] {
            urls = concepts.compactMap { $0["url"] as? String }
        }
        if urls.isEmpty, let url = data["url"] as? String { urls = [url] }
        guard !urls.isEmpty else {
            throw NSError(
                domain: "Miracles", code: -1,
                userInfo: [NSLocalizedDescriptionKey: "No image was returned."]
            )
        }
        return DrawResult(urls: urls, version: data["version"] as? String)
    }
}
