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
        let url: String
        let version: String?
    }

    func illustrate(text: String, boxID: String, distill: Bool) async throws -> DrawResult {
        try await ensureSignedIn()
        let result = try await functions.httpsCallable("illustrateMiracle").call([
            "text": text,
            "id": boxID,
            "distill": distill,
        ])
        guard
            let data = result.data as? [String: Any],
            let url = data["url"] as? String
        else {
            throw NSError(
                domain: "Miracles", code: -1,
                userInfo: [NSLocalizedDescriptionKey: "No image was returned."]
            )
        }
        return DrawResult(url: url, version: data["version"] as? String)
    }
}
