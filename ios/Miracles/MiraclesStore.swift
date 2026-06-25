import Foundation

/// The book + navigation state, persisted locally as JSON. (Firestore cloud
/// sync is the planned next step.)
@MainActor
final class MiraclesStore: ObservableObject {
    @Published var pages: [MiraclePage]
    @Published var index: Int = 0

    private let fileURL: URL = {
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        return dir.appendingPathComponent("miraclesBook.json")
    }()

    init() {
        if let data = try? Data(contentsOf: fileURL),
           let loaded = try? JSONDecoder().decode([MiraclePage].self, from: data),
           !loaded.isEmpty {
            pages = loaded
        } else {
            pages = [MiraclePage()]
        }
        index = pages.count - 1
    }

    var page: MiraclePage { pages[index] }

    private func save() {
        if let data = try? JSONEncoder().encode(pages) {
            try? data.write(to: fileURL, options: .atomic)
        }
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
        guard let b = boxIndex(boxID) else { return }
        var box = pages[index].boxes[b]
        let keep = max(0, box.histIndex + 1)
        box.history = Array(box.history.prefix(keep)) + [url]
        box.histIndex = box.history.count - 1
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
}
