import Foundation

struct MiracleBox: Codable, Identifiable, Equatable {
    var id: String = UUID().uuidString
    var text: String = ""
    var history: [String] = []   // ordered drawing URLs (permanent Storage URLs)
    var histIndex: Int = -1      // -1 = nothing drawn yet
    var selected: Bool = false   // the chosen drawing is locked (controls hidden)

    var url: String? {
        guard histIndex >= 0, histIndex < history.count else { return nil }
        return history[histIndex]
    }
    var canUndo: Bool { histIndex > 0 }
    var canRedo: Bool { histIndex >= 0 && histIndex < history.count - 1 }

    init() {}
    init(text: String) { self.text = text }

    // Decode leniently so books saved before a field existed still load — a
    // missing key falls back to its default instead of failing the whole decode
    // (which would otherwise wipe the user's book on upgrade).
    enum CodingKeys: String, CodingKey { case id, text, history, histIndex, selected }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decodeIfPresent(String.self, forKey: .id) ?? UUID().uuidString
        text = try c.decodeIfPresent(String.self, forKey: .text) ?? ""
        history = try c.decodeIfPresent([String].self, forKey: .history) ?? []
        histIndex = try c.decodeIfPresent(Int.self, forKey: .histIndex) ?? -1
        selected = try c.decodeIfPresent(Bool.self, forKey: .selected) ?? false
    }
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
