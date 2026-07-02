import SwiftUI
import UIKit
import FirebaseAuth
import FirebaseFirestore

/// A quest completion in the shared Hall of Absurdity (`sidequestPosts/{id}`).
struct FeedPost: Identifiable, Equatable {
    let id: String
    let questTitle: String
    let story: String
    let username: String
    let avatar: String
    let byUid: String
    let ts: Double
    var reactions: [String: Int]    // keyed by FeedService.reactionKeys
    let imageData: Data?
    var isSeed = false

    var reactionTotal: Int { reactions.values.reduce(0, +) }
}

/// The shared gallery: anonymous auth + a live Firestore feed. Photos travel
/// inline as compressed JPEG blobs (kept well under the 1MB doc limit) so no
/// Storage bucket/rules are involved; can move to Storage if posts grow.
/// If Firebase is unreachable the app degrades to the old local-only Hall.
@MainActor
final class FeedService: ObservableObject {
    static let reactionKeys = ["laugh", "mind", "clap"]
    static let reactionEmoji = ["laugh": "😂", "mind": "🤯", "clap": "👏"]

    @Published var posts: [FeedPost] = []
    @Published var connected = false

    private lazy var db = Firestore.firestore()
    private var listener: ListenerRegistration?
    private var col: CollectionReference { db.collection("sidequestPosts") }

    var uid: String? { Auth.auth().currentUser?.uid }

    func start() {
        guard listener == nil else { return }
        Task {
            do {
                if Auth.auth().currentUser == nil {
                    try await Auth.auth().signInAnonymously()
                }
                attach()
            } catch {
                print("SideQuest feed: sign-in failed — \(error.localizedDescription)")
            }
        }
    }

    private func attach() {
        listener = col.order(by: "ts", descending: true).limit(to: 40)
            .addSnapshotListener { [weak self] snap, _ in
                guard let self, let snap else { return }
                self.connected = true
                self.posts = snap.documents.compactMap { Self.decode($0) }
            }
    }

    private static func decode(_ doc: QueryDocumentSnapshot) -> FeedPost? {
        let d = doc.data()
        guard let story = d["story"] as? String else { return nil }
        return FeedPost(
            id: doc.documentID,
            questTitle: d["questTitle"] as? String ?? "Unknown Quest",
            story: story,
            username: d["username"] as? String ?? "npc",
            avatar: d["avatar"] as? String ?? "🧙‍♂️",
            byUid: d["byUid"] as? String ?? "",
            ts: (d["ts"] as? Timestamp)?.dateValue().timeIntervalSince1970 ?? 0,
            reactions: d["reactions"] as? [String: Int] ?? [:],
            imageData: d["image"] as? Data)
    }

    /// Post a completed quest to the Hall. Fire-and-forget: local XP/state is
    /// already saved by the caller, and offline writes sync when back online.
    func post(quest: Quest, story: String, image: Data?, username: String, avatar: String) {
        guard let uid else { return }
        var data: [String: Any] = [
            "questId": quest.id,
            "questTitle": quest.title,
            "story": String(story.prefix(2000)),
            "username": String(username.prefix(20)),
            "avatar": avatar,
            "byUid": uid,
            "ts": FieldValue.serverTimestamp(),
            "reactions": Self.reactionKeys.reduce(into: [String: Int]()) { $0[$1] = 0 },
        ]
        if let image, let jpeg = Self.compressed(image) { data["image"] = jpeg }
        col.addDocument(data: data)
    }

    /// Apply a reaction change: tapping toggles, tapping another emoji switches.
    func react(post: FeedPost, from oldKey: String?, to newKey: String?) {
        guard !post.isSeed else { return }
        var changes: [String: Any] = [:]
        if let oldKey { changes["reactions.\(oldKey)"] = FieldValue.increment(Int64(-1)) }
        if let newKey { changes["reactions.\(newKey)"] = FieldValue.increment(Int64(1)) }
        guard !changes.isEmpty else { return }
        col.document(post.id).updateData(changes)
    }

    /// Resize + recompress a photo so the post doc stays small (≤ ~300KB).
    static func compressed(_ data: Data, maxDim: CGFloat = 900, maxBytes: Int = 300_000) -> Data? {
        guard let ui = UIImage(data: data) else { return nil }
        let scale = min(1, maxDim / max(ui.size.width, ui.size.height))
        let size = CGSize(width: floor(ui.size.width * scale), height: floor(ui.size.height * scale))
        let fmt = UIGraphicsImageRendererFormat.default()
        fmt.scale = 1
        let resized = UIGraphicsImageRenderer(size: size, format: fmt).image { _ in
            ui.draw(in: CGRect(origin: .zero, size: size))
        }
        for q: CGFloat in [0.7, 0.5, 0.35, 0.25] {
            if let d = resized.jpegData(compressionQuality: q), d.count <= maxBytes { return d }
        }
        return resized.jpegData(compressionQuality: 0.2)
    }
}
