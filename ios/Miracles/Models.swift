import Foundation

struct MiracleBox: Codable, Identifiable, Equatable {
    var id: String = UUID().uuidString
    var text: String = ""
    /// Every drawing made for this box, oldest first (permanent Storage URLs).
    /// A redraw adds to the end; nothing is ever removed.
    var history: [String] = []
    var histIndex: Int = -1      // which drawing is showing; -1 = nothing drawn yet
    /// "Keep this one": the showing drawing is kept, so redraw and the arrows
    /// stay hidden until she un-keeps it.
    var selected: Bool = false
    /// Quality ladder: maps a drawing URL to the same concept rendered at the
    /// next tier up (fast → better → best). The ▲ control follows this chain.
    var upgrades: [String: String] = [:]

    var url: String? {
        guard histIndex >= 0, histIndex < history.count else { return nil }
        return history[histIndex]
    }
    var canUndo: Bool { histIndex > 0 }
    var canRedo: Bool { histIndex >= 0 && histIndex < history.count - 1 }

    init() {}
    init(text: String) { self.text = text }

    // Decode leniently so books saved before a field existed still load — a
    // missing (or unreadable) field falls back to its default instead of
    // failing the whole decode, which would otherwise lose the book.
    enum CodingKeys: String, CodingKey { case id, text, history, histIndex, selected, upgrades }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decodeIfPresent(String.self, forKey: .id)) ?? UUID().uuidString
        text = (try? c.decodeIfPresent(String.self, forKey: .text)) ?? ""
        history = (try? c.decodeIfPresent([String].self, forKey: .history)) ?? []
        histIndex = (try? c.decodeIfPresent(Int.self, forKey: .histIndex)) ?? -1
        selected = (try? c.decodeIfPresent(Bool.self, forKey: .selected)) ?? false
        upgrades = (try? c.decodeIfPresent([String: String].self, forKey: .upgrades)) ?? [:]
    }
}

struct MiraclePage: Codable, Identifiable, Equatable {
    var id: String = UUID().uuidString
    var date: Date = Date()
    var boxes: [MiracleBox] = [MiracleBox(), MiracleBox(), MiracleBox(), MiracleBox()]
    /// When this page last changed (seconds since 1970). When the copy on this
    /// phone and the cloud copy disagree about a page, the newer one wins.
    var updatedAt: Double = 0

    var hasContent: Bool {
        boxes.contains {
            !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || $0.url != nil
        }
    }

    init() {}

    // Lenient for the same reason as MiracleBox: a field added later must
    // never make an older book fail to load and fall back to an empty one.
    enum CodingKeys: String, CodingKey { case id, date, boxes, updatedAt }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? c.decodeIfPresent(String.self, forKey: .id)) ?? UUID().uuidString
        date = (try? c.decodeIfPresent(Date.self, forKey: .date)) ?? Date()
        boxes = try c.decodeIfPresent([MiracleBox].self, forKey: .boxes)
            ?? [MiracleBox(), MiracleBox(), MiracleBox(), MiracleBox()]
        updatedAt = (try? c.decodeIfPresent(Double.self, forKey: .updatedAt)) ?? 0
    }
}
