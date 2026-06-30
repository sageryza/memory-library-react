import Foundation
import UIKit
import FirebaseCore
import FirebaseAuth
import FirebaseFirestore
import GoogleSignIn

/// A saved XI memory (mirrors the shared `users/{uid}/memories` schema).
struct XIMemory: Identifiable {
    let id: String
    let content: String
    let title: String
    let pairKey: String
    let eventId: String
    let twistId: String
    let eventCap: String
    let twistCap: String
    let hashtags: [String]
    let mode: String          // "board" or "versus"
    let dateTime: String      // short display date, e.g. "6/28/26"
    let timestamp: String     // ISO8601, used for sorting
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

    /// Sign in with Google (same provider as the web), then exchange the Google
    /// credential for a Firebase session so the user's real memories/libraries
    /// load. Must run on the main actor (presents UI).
    func signInWithGoogle(presenting: UIViewController) async throws {
        guard let clientID = FirebaseApp.app()?.options.clientID else {
            throw NSError(domain: "XI", code: -2,
                          userInfo: [NSLocalizedDescriptionKey: "Missing Google client ID."])
        }
        GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
        let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presenting)
        guard let idToken = result.user.idToken?.tokenString else {
            throw NSError(domain: "XI", code: -3,
                          userInfo: [NSLocalizedDescriptionKey: "Google sign-in returned no ID token."])
        }
        let credential = GoogleAuthProvider.credential(
            withIDToken: idToken, accessToken: result.user.accessToken.tokenString)
        try await Auth.auth().signIn(with: credential)
    }

    func signOut() throws { try Auth.auth().signOut() }

    // MARK: Save

    func saveMemory(event: XICard, twist: XICard, text: String, boardDay: Int, mode: String = "board") async throws {
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
            "mode": mode,
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
            eventId: ev?["id"] as? String ?? "",
            twistId: tw?["id"] as? String ?? "",
            eventCap: ev?["cap"] as? String ?? "",
            twistCap: tw?["cap"] as? String ?? "",
            hashtags: (d["hashtags"] as? [String]) ?? [],
            mode: d["mode"] as? String ?? "board",
            dateTime: d["dateTime"] as? String ?? "",
            timestamp: d["timestamp"] as? String ?? ""
        )
    }

    // MARK: Constellation connections (manual strings between cards)

    /// Loads the user's hand-drawn connections from
    /// `users/{uid}/xiBoard/connections` (stored as an array of {a,b} maps —
    /// Firestore can't nest plain arrays).
    func loadConnections() async -> [(String, String)] {
        guard let uid = Auth.auth().currentUser?.uid else { return [] }
        let snap = try? await db.collection("users").document(uid)
            .collection("xiBoard").document("connections").getDocument()
        let arr = (snap?.data()?["pairs"] as? [[String: String]]) ?? []
        return arr.compactMap { d in
            guard let a = d["a"], let b = d["b"] else { return nil }
            return (a, b)
        }
    }

    /// Persists the full set of hand-drawn connections (overwrites).
    func saveConnections(_ pairs: [(String, String)]) async {
        guard let uid = Auth.auth().currentUser?.uid else { return }
        let arr = pairs.map { ["a": $0.0, "b": $0.1] }
        try? await db.collection("users").document(uid)
            .collection("xiBoard").document("connections")
            .setData(["pairs": arr, "updatedAt": FieldValue.serverTimestamp()])
    }

    // MARK: Libraries (smart collections — shared with the web app)

    func loadLibraries() async -> [XILibrary] {
        guard let uid = Auth.auth().currentUser?.uid else { return [] }
        let snap = try? await db.collection("users").document(uid)
            .collection("libraries").getDocuments()
        return (snap?.documents ?? []).map(parseLibrary)
    }

    private func parseLibrary(_ doc: QueryDocumentSnapshot) -> XILibrary {
        let d = doc.data()
        let ids: [String]
        if let s = d["manualMemoryIds"] as? [String] { ids = s }
        else if let a = d["manualMemoryIds"] as? [Any] { ids = a.map { String(describing: $0) } }
        else { ids = [] }
        return XILibrary(
            id: doc.documentID,
            name: d["name"] as? String ?? "Untitled",
            description: d["description"] as? String ?? "",
            colorHex: d["color"] as? String,
            isCore: d["isCore"] as? Bool ?? false,
            isLocked: d["isLocked"] as? Bool ?? false,
            manualMemoryIds: ids,
            searchLogic: XISearchLogic(d["searchLogic"] as? [String: Any])
        )
    }

    @discardableResult
    func createLibrary(name: String, searchLogic: XISearchLogic? = nil,
                       manualMemoryIds: [String] = [], isLocked: Bool = false,
                       colorHex: String? = nil) async -> String? {
        guard let uid = Auth.auth().currentUser?.uid else { return nil }
        let iso = ISO8601DateFormatter()
        var doc: [String: Any] = [
            "name": name,
            "description": "",
            "manualMemoryIds": manualMemoryIds,
            "searchLogic": searchLogic.map { $0.dict } ?? NSNull(),
            "isLocked": isLocked,
            "isCore": false,
            "color": colorHex ?? NSNull(),
            "createdAt": iso.string(from: Date()),
            "userId": uid,
        ]
        if colorHex == nil { doc["color"] = NSNull() }
        let ref = try? await db.collection("users").document(uid)
            .collection("libraries").addDocument(data: doc)
        return ref?.documentID
    }

    func updateLibrary(_ id: String, _ fields: [String: Any]) async {
        guard let uid = Auth.auth().currentUser?.uid else { return }
        try? await db.collection("users").document(uid)
            .collection("libraries").document(id).updateData(fields)
    }

    func deleteLibrary(_ id: String) async {
        guard let uid = Auth.auth().currentUser?.uid else { return }
        try? await db.collection("users").document(uid)
            .collection("libraries").document(id).delete()
    }

    // MARK: Constellation card positions (persist the board arrangement)

    func loadBoardPositions() async -> [String: CGPoint] {
        guard let uid = Auth.auth().currentUser?.uid else { return [:] }
        let snap = try? await db.collection("users").document(uid)
            .collection("xiBoard").document("positions").getDocument()
        let raw = (snap?.data()?["pins"] as? [String: [String: Double]]) ?? [:]
        var out: [String: CGPoint] = [:]
        for (id, p) in raw {
            if let x = p["x"], let y = p["y"] { out[id] = CGPoint(x: x, y: y) }
        }
        return out
    }

    func saveBoardPositions(_ positions: [String: CGPoint]) async {
        guard let uid = Auth.auth().currentUser?.uid else { return }
        var pins: [String: [String: Double]] = [:]
        for (id, p) in positions { pins[id] = ["x": Double(p.x), "y": Double(p.y)] }
        try? await db.collection("users").document(uid)
            .collection("xiBoard").document("positions")
            .setData(["pins": pins, "updatedAt": FieldValue.serverTimestamp()])
    }

    // MARK: Memory edits (used by archive bulk actions)

    func deleteMemory(_ id: String) async {
        guard let uid = Auth.auth().currentUser?.uid else { return }
        try? await db.collection("users").document(uid)
            .collection("memories").document(id).delete()
    }

    func updateMemoryHashtags(_ id: String, _ hashtags: [String]) async {
        guard let uid = Auth.auth().currentUser?.uid else { return }
        try? await db.collection("users").document(uid)
            .collection("memories").document(id)
            .updateData(["hashtags": hashtags, "updatedAt": FieldValue.serverTimestamp()])
    }

    private func slugTag(_ cap: String) -> String? {
        let slug = cap.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "[^a-z0-9]+", with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        return slug.isEmpty ? nil : "#\(slug)"
    }
}
