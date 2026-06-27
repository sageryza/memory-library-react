import Foundation
import FirebaseAuth
import FirebaseFirestore

/// Anonymous auth + saving XI board memories to the shared archive, using the
/// exact same memory schema as the web app so they appear in the web library.
@MainActor
final class XIService {
    static let shared = XIService()
    private lazy var db = Firestore.firestore()

    func ensureSignedIn() async throws {
        if Auth.auth().currentUser == nil {
            try await Auth.auth().signInAnonymously()
        }
    }

    func saveMemory(event: XICard, twist: XICard, text: String, boardDay: Int) async throws {
        try await ensureSignedIn()
        guard let uid = Auth.auth().currentUser?.uid else { return }

        let evCap = event.cap, twCap = twist.cap
        let title = "I \(evCap.lowercased()), \(twCap.lowercased())"
        let tags = [slugTag(evCap), slugTag(twCap)].compactMap { $0 }

        let now = Date()
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let df = DateFormatter(); df.dateStyle = .short; df.timeStyle = .none

        let doc: [String: Any] = [
            "content": text.trimmingCharacters(in: .whitespacesAndNewlines),
            "title": title,
            "hashtags": tags,
            "source": "xi",
            "mode": "board",
            "event": ["id": event.id, "cap": evCap],
            "twist": ["id": twist.id, "cap": twCap],
            "pairKey": "\(event.id)__\(twist.id)",
            "timestamp": iso.string(from: now),
            "dateTime": df.string(from: now),
            "boardDay": boardDay,
            "createdAt": FieldValue.serverTimestamp(),
            "updatedAt": FieldValue.serverTimestamp(),
        ]
        _ = try await db.collection("users").document(uid)
            .collection("memories").addDocument(data: doc)
    }

    private func slugTag(_ cap: String) -> String? {
        let lowered = cap.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        let slug = lowered
            .replacingOccurrences(of: "[^a-z0-9]+", with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        return slug.isEmpty ? nil : "#\(slug)"
    }
}
