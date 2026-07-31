import Foundation
import FirebaseAuth
import FirebaseFunctions

/// One drawing in the shared SAGEDIAGRAM pool (Firestore `sagediagram`),
/// reached through the `sagediagram` Cloud Function.
struct SagediagramItem: Identifiable, Equatable, Codable {
    let id: String
    let name: String
    var month: String
    var caption: String
    let url: String
}

/// Month buckets, in the order the web gallery uses.
let sagediagramMonthOrder = ["February", "March", "April", "Summer",
                             "September", "October", "Composite", "Oldest", "Unsorted"]
func sagediagramMonthRank(_ m: String) -> Int {
    sagediagramMonthOrder.firstIndex(of: m) ?? sagediagramMonthOrder.count
}

/// Thin wrapper over the shared `sagediagram` callable: anonymous auth, then
/// list / caption. Images load from the returned Storage URLs (no direct
/// Storage/Firestore SDK needed).
@MainActor
final class SagediagramService {
    static let shared = SagediagramService()
    private lazy var functions = Functions.functions()

    private func ensureSignedIn() async throws {
        if Auth.auth().currentUser == nil {
            try await Auth.auth().signInAnonymously()
        }
    }

    func list() async throws -> [SagediagramItem] {
        try await ensureSignedIn()
        let res = try await functions.httpsCallable("sagediagram").call(["mode": "list"])
        guard let data = res.data as? [String: Any],
              let items = data["items"] as? [[String: Any]] else { return [] }
        return items.compactMap { d in
            guard let id = d["id"] as? String, let url = d["url"] as? String else { return nil }
            return SagediagramItem(
                id: id,
                name: d["name"] as? String ?? id,
                month: d["month"] as? String ?? "Unsorted",
                caption: d["caption"] as? String ?? "",
                url: url
            )
        }
    }

    // MARK: - Local cache of the list
    //
    // The callable takes a second or two on a cold launch, so the last list is
    // kept on disk and shown immediately while a fresh one loads behind it.

    private var cacheFile: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("sagediagram-list.json")
    }

    func cachedList() -> [SagediagramItem]? {
        guard let data = try? Data(contentsOf: cacheFile) else { return nil }
        return try? JSONDecoder().decode([SagediagramItem].self, from: data)
    }

    func saveCache(_ items: [SagediagramItem]) {
        guard let data = try? JSONEncoder().encode(items) else { return }
        try? data.write(to: cacheFile, options: .atomic)
    }

    func setCaption(id: String, caption: String) async throws {
        try await ensureSignedIn()
        _ = try await functions.httpsCallable("sagediagram").call([
            "mode": "caption", "id": id, "caption": caption,
        ])
    }
}
