import Foundation

struct MiracleBox: Codable, Identifiable, Equatable {
    var id: String = UUID().uuidString
    var text: String = ""
    var history: [String] = []   // ordered drawing URLs (permanent Storage URLs)
    var histIndex: Int = -1      // -1 = nothing drawn yet

    var url: String? {
        guard histIndex >= 0, histIndex < history.count else { return nil }
        return history[histIndex]
    }
    var canUndo: Bool { histIndex > 0 }
    var canRedo: Bool { histIndex >= 0 && histIndex < history.count - 1 }
}

struct MiraclePage: Codable, Identifiable, Equatable {
    var id: String = UUID().uuidString
    var date: Date = Date()
    var boxes: [MiracleBox] = [MiracleBox(), MiracleBox(), MiracleBox(), MiracleBox()]

    var hasContent: Bool {
        boxes.contains {
            !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || $0.url != nil
        }
    }
}
