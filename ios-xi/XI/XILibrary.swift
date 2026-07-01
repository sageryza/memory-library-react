import Foundation

extension String { var xiTrimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) } }

/// Saved boolean search criteria — mirrors the web app's `searchLogic`:
/// AND terms (all must match), OR terms (any), one Exclude term (NOT), each
/// scoped to any of Titles / Content / Hashtags / Dates.
struct XISearchLogic: Equatable {
    var andTerms: [String] = [""]   // one empty row so the builder shows a field
    var orTerms: [String] = [""]
    var excludeTerms: String = ""
    var searchInTitles = true
    var searchInContent = true
    var searchInHashtags = true
    var searchInDates = true

    init() {}

    /// Parse from a Firestore map (nil-safe — returns nil if there's no logic).
    init?(_ d: [String: Any]?) {
        guard let d else { return nil }
        andTerms = (d["andTerms"] as? [String]) ?? []
        orTerms = (d["orTerms"] as? [String]) ?? []
        excludeTerms = (d["excludeTerms"] as? String) ?? ""
        searchInTitles = (d["searchInTitles"] as? Bool) ?? true
        searchInContent = (d["searchInContent"] as? Bool) ?? true
        searchInHashtags = (d["searchInHashtags"] as? Bool) ?? true
        searchInDates = (d["searchInDates"] as? Bool) ?? true
    }

    var trimmedAnd: [String] { andTerms.map(\.xiTrimmed).filter { !$0.isEmpty } }
    var trimmedOr: [String] { orTerms.map(\.xiTrimmed).filter { !$0.isEmpty } }
    var excludeList: [String] {
        excludeTerms.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces).lowercased() }
            .filter { !$0.isEmpty }
    }

    var isEmpty: Bool { trimmedAnd.isEmpty && trimmedOr.isEmpty && excludeList.isEmpty }

    /// Firestore representation (matches the web schema exactly).
    var dict: [String: Any] {
        [
            "andTerms": trimmedAnd,
            "orTerms": trimmedOr,
            "excludeTerms": excludeTerms,
            "searchInTitles": searchInTitles,
            "searchInContent": searchInContent,
            "searchInHashtags": searchInHashtags,
            "searchInDates": searchInDates,
        ]
    }

    /// Does a memory satisfy this search logic? Field-scoped, like the web's
    /// `getLibraryMemories`.
    func matches(_ m: XIMemory) -> Bool {
        func hit(_ term: String) -> Bool {
            let t = term.lowercased()
            if searchInTitles, m.title.lowercased().contains(t) { return true }
            if searchInContent, m.content.lowercased().contains(t) { return true }
            if searchInHashtags, m.hashtags.contains(where: { $0.lowercased().contains(t) }) { return true }
            if searchInDates, m.dateTime.lowercased().contains(t) || m.timestamp.lowercased().contains(t) { return true }
            return false
        }
        let ands = trimmedAnd, ors = trimmedOr
        let andOK = ands.isEmpty || ands.allSatisfy { hit($0) }
        let orOK = ors.isEmpty || ors.contains { hit($0) }
        let exOK = excludeList.isEmpty || !excludeList.contains { ex in
            m.title.lowercased().contains(ex) || m.content.lowercased().contains(ex)
                || m.hashtags.contains(where: { $0.lowercased().contains(ex) })
                || m.dateTime.lowercased().contains(ex) || m.timestamp.lowercased().contains(ex)
        }
        return andOK && orOK && exOK
    }
}

/// A memory collection — manual picks and/or a saved search, optionally locked
/// (its memories are hidden from the main archive until you open the library).
/// Mirrors `users/{uid}/libraries/{id}` from the web app.
struct XILibrary: Identifiable, Equatable {
    let id: String
    var name: String
    var description: String
    var colorHex: String?
    var isCore: Bool
    var isLocked: Bool
    var manualMemoryIds: [String]
    var searchLogic: XISearchLogic?

    /// Union of manually-added memories and any that match the saved search.
    func memories(from all: [XIMemory]) -> [XIMemory] {
        var ids = Set(manualMemoryIds.map { String($0) })
        if let logic = searchLogic {
            for m in all where logic.matches(m) { ids.insert(m.id) }
        }
        return all.filter { ids.contains($0.id) }
    }

    func count(in all: [XIMemory]) -> Int { memories(from: all).count }
}

extension XIMemory {
    /// A copy with replaced hashtags (XIMemory's stored properties are `let`).
    func withHashtags(_ tags: [String]) -> XIMemory {
        XIMemory(id: id, content: content, title: title, pairKey: pairKey,
                 eventId: eventId, twistId: twistId, eventCap: eventCap, twistCap: twistCap,
                 hashtags: tags, mode: mode, dateTime: dateTime, timestamp: timestamp,
                 additionalContext: additionalContext)
    }
}

/// A hashtag in the boolean filter, joined to the previous one by AND/OR.
struct HashtagFilter: Identifiable, Equatable {
    enum Op: String { case and = "AND", or = "OR" }
    let tag: String          // normalized, lowercased, leading "#"
    var op: Op               // ignored for the first chip
    var id: String { tag }
}
