import Foundation
import FirebaseAuth
import FirebaseFirestore

/// The book + navigation state. Persisted locally as JSON for instant launch,
/// and mirrored to Firestore (`miracleBooks/{uid}`) so it survives reinstalls
/// and can sync across devices. Last-write-wins by `updatedAt`.
@MainActor
final class MiraclesStore: ObservableObject {
    @Published var pages: [MiraclePage]
    @Published var index: Int = 0

    private let fileURL: URL = {
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        return dir.appendingPathComponent("miraclesBook.json")
    }()
    private let db = Firestore.firestore()
    private let updatedKey = "miraclesUpdatedAt"
    private var updatedAt: Date

    init() {
        if let data = try? Data(contentsOf: fileURL),
           let loaded = try? JSONDecoder().decode([MiraclePage].self, from: data),
           !loaded.isEmpty {
            pages = loaded
        } else {
            pages = [MiraclePage()]
        }
        updatedAt = Date(timeIntervalSince1970: UserDefaults.standard.double(forKey: updatedKey))
        index = pages.count - 1
    }

    var page: MiraclePage { pages[index] }

    /// True when the book is just the empty starter page (safe to overwrite from cloud).
    private var isEmptyBook: Bool { pages.count == 1 && !pages[0].hasContent }

    private func writeLocal() {
        if let data = try? JSONEncoder().encode(pages) {
            try? data.write(to: fileURL, options: .atomic)
        }
    }

    private func save() {
        updatedAt = Date()
        UserDefaults.standard.set(updatedAt.timeIntervalSince1970, forKey: updatedKey)
        writeLocal()
        Task { await pushToCloud() }
    }

    private func boxIndex(_ boxID: String) -> Int? {
        pages[index].boxes.firstIndex(where: { $0.id == boxID })
    }

    func setText(_ text: String, boxID: String) {
        guard let b = boxIndex(boxID) else { return }
        pages[index].boxes[b].text = text
        save()
    }

    /// Append a new drawing, discarding any redo-future.
    func pushDrawing(_ url: String, boxID: String) {
        pushDrawings([url], boxID: boxID)
    }

    /// Append a batch of drawing options (one draw can return several concepts),
    /// discarding any redo-future, and land on the FIRST of the new batch — the
    /// other options are reachable with the › arrow so the user can pick.
    func pushDrawings(_ urls: [String], boxID: String) {
        guard !urls.isEmpty, let b = boxIndex(boxID) else { return }
        var box = pages[index].boxes[b]
        let keep = max(0, box.histIndex + 1)
        box.history = Array(box.history.prefix(keep)) + urls
        box.histIndex = keep // first of the newly added options
        pages[index].boxes[b] = box
        save()
    }

    /// dir -1 = undo, +1 = redo
    func step(_ dir: Int, boxID: String) {
        guard let b = boxIndex(boxID) else { return }
        var box = pages[index].boxes[b]
        guard !box.history.isEmpty else { return }
        box.histIndex = min(max(0, box.histIndex + dir), box.history.count - 1)
        pages[index].boxes[b] = box
        save()
    }

    var canTurnForward: Bool { index < pages.count - 1 || page.hasContent }

    func turnBack() { if index > 0 { index -= 1 } }

    func turnForward() {
        if index < pages.count - 1 { index += 1; return }
        guard page.hasContent else { return }
        pages.append(MiraclePage())
        index = pages.count - 1
        save()
    }

    func loadSamples() {
        let samples = [
            "It was my birthday and we went to get cake but the shop was closed — we told them and they let us in anyway",
            "I ran into a guy I'd run into twice before — last time he'd taken a picture of a book I dropped",
            "My mom got me a Mini Brands surprise ball, and the food inside was strawberry whipped-cream pancakes",
            "I almost fainted in the bathroom and a girl named Hope got me water — she has a doctor's appointment for fainting tomorrow",
        ]
        pages[index].boxes = samples.map { MiracleBox(text: $0) }
        save()
    }

    // MARK: - Cloud sync

    private func docRef() -> DocumentReference? {
        guard let uid = Auth.auth().currentUser?.uid else { return nil }
        return db.collection("miracleBooks").document(uid)
    }

    private func pushToCloud() async {
        guard let ref = docRef(),
              let data = try? JSONEncoder().encode(pages),
              let json = String(data: data, encoding: .utf8) else { return }
        try? await ref.setData([
            "data": json,
            "updatedAt": updatedAt.timeIntervalSince1970,
        ])
    }

    /// Called once at launch after sign-in: pull the cloud copy and reconcile.
    /// If the cloud copy is newer (or we only have the empty starter), adopt it;
    /// otherwise push our local copy up so the cloud has the latest.
    func startSync() async {
        guard let ref = docRef() else { return }
        if let snap = try? await ref.getDocument(), snap.exists,
           let json = snap.get("data") as? String,
           let rdata = json.data(using: .utf8),
           let remote = try? JSONDecoder().decode([MiraclePage].self, from: rdata),
           !remote.isEmpty {
            let remoteUpdated = (snap.get("updatedAt") as? Double) ?? 0
            if isEmptyBook || remoteUpdated > updatedAt.timeIntervalSince1970 {
                pages = remote
                index = pages.count - 1
                updatedAt = Date(timeIntervalSince1970: remoteUpdated)
                UserDefaults.standard.set(remoteUpdated, forKey: updatedKey)
                writeLocal()
                return
            }
        }
        await pushToCloud()
    }
}
