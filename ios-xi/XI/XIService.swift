import Foundation
import FirebaseAuth
import FirebaseFirestore

/// A saved XI memory (subset of the shared schema we display).
struct XIMemory: Identifiable {
    let id: String
    let content: String
    let title: String
    let pairKey: String
    let eventCap: String
    let twistCap: String
    let timestamp: String
}

/// Publishes the current Firebase auth user so the UI can gate sign-in.
@MainActor
final class AuthState: ObservableObject {
    @Published var user: User?
    private var handle: AuthStateDidChangeListenerHandle?

    init() {
        user = Auth.auth().currentUser
        handle = Auth.auth().addStateDidChangeListener { [weak self] _, u in
            Task { @MainActor in self?.user = u }
        }
    }

    var signedIn: Bool { user != nil }
    var isAnonymous: Bool { user?.isAnonymous ?? false }
    var email: String? { user?.email }
    var uid: String? { user?.uid }
}

/// Auth + reading/writing XI memories in the shared `users/{uid}/memories`
/// archive, using the exact same schema as the web app.
@MainActor
final class XIService {
    static let shared = XIService()
    private lazy var db = Firestore.firestore()

    // MARK: Auth

    func signIn(email: String, password: String) async throws {
        try await Auth.auth().signIn(withEmail: email, password: password)
    }

    func playAnonymously() async throws {
        if Auth.auth().currentUser == nil {
            try await Auth.auth().signInAnonymously()
        }
    }

    func signOut() throws { try Auth.auth().signOut() }

    // MARK: Save

    func saveMemory(event: XICard, twist: XICard, text: String, boardDay: Int) async throws {
        guard let uid = Auth.auth().currentUser?.uid else {
            throw NSError(domain: "XI", code: -1, userInfo: [NSLocalizedDescriptionKey: "Not signed in."])
        }
        let evCap = event.cap, twCap = twist.cap
        let title = "I \(evCap.lowercased()), \(twCap.lowercased())"
        let tags = [slugTag(evCap), slugTag(twCap)].compactMap { $0 }

        let now = Date()
        let iso = ISO8601DateFormatter(); iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
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

    // MARK: Read

    func memories(pairKey: String) async -> [XIMemory] {
        guard let uid = Auth.auth().currentUser?.uid else { return [] }
        let snap = try? await db.collection("users").document(uid).collection("memories")
            .whereField("pairKey", isEqualTo: pairKey).getDocuments()
        return (snap?.documents ?? []).compactMap(parse).sorted { $0.timestamp > $1.timestamp }
    }

    func allXiMemories() async -> [XIMemory] {
        guard let uid = Auth.auth().currentUser?.uid else { return [] }
        let snap = try? await db.collection("users").document(uid).collection("memories")
            .whereField("source", isEqualTo: "xi").getDocuments()
        return (snap?.documents ?? []).compactMap(parse).sorted { $0.timestamp > $1.timestamp }
    }

    private func parse(_ doc: QueryDocumentSnapshot) -> XIMemory? {
        let d = doc.data()
        guard let content = d["content"] as? String else { return nil }
        let ev = d["event"] as? [String: Any]
        let tw = d["twist"] as? [String: Any]
        return XIMemory(
            id: doc.documentID,
            content: content,
            title: d["title"] as? String ?? "",
            pairKey: d["pairKey"] as? String ?? "",
            eventCap: ev?["cap"] as? String ?? "",
            twistCap: tw?["cap"] as? String ?? "",
            timestamp: d["timestamp"] as? String ?? ""
        )
    }

    private func slugTag(_ cap: String) -> String? {
        let slug = cap.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "[^a-z0-9]+", with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        return slug.isEmpty ? nil : "#\(slug)"
    }
}
