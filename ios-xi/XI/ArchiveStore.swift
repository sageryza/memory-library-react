import SwiftUI

/// Normalize a hashtag: leading "#", lowercased.
func xiNormTag(_ raw: String) -> String {
    let t = raw.xiTrimmed.lowercased()
    guard !t.isEmpty else { return "" }
    return t.hasPrefix("#") ? t : "#\(t)"
}

/// Backs the archive screen: loads memories + libraries, holds every filter the
/// web Archive has (text search, boolean hashtags, advanced AND/OR/NOT search,
/// mode, sort, library selection, locked-library hiding, select mode) and
/// computes the filtered, sorted result. Filters compose (all AND together).
@MainActor
final class ArchiveStore: ObservableObject {
    enum Sort: String, CaseIterable, Identifiable { case newest = "Newest", oldest = "Oldest"; var id: String { rawValue } }
    enum Mode: String, CaseIterable, Identifiable { case all = "All", board = "Board", versus = "Versus"; var id: String { rawValue } }

    @Published var memories: [XIMemory] = []
    @Published var libraries: [XILibrary] = []
    @Published var loading = true

    // Filters
    @Published var search = ""
    @Published var tagFilters: [HashtagFilter] = []     // boolean hashtag chips
    @Published var advanced = XISearchLogic()           // advanced search builder
    @Published var advancedOn = false
    @Published var mode: Mode = .all
    @Published var sort: Sort = .newest
    @Published var selectedLibraryId: String?

    // Simplify view (persisted)
    @Published var simplify = UserDefaults.standard.bool(forKey: "xiSimplifyView") {
        didSet { UserDefaults.standard.set(simplify, forKey: "xiSimplifyView") }
    }

    // Select mode
    @Published var selectMode = false
    @Published var selectedIds: Set<String> = []

    var selectedLibrary: XILibrary? {
        guard let id = selectedLibraryId else { return nil }
        return libraries.first { $0.id == id }
    }

    /// How many distinct filters are active (drives the badge on the Filter button).
    var activeFilterCount: Int {
        var n = 0
        if !search.xiTrimmed.isEmpty { n += 1 }
        if !tagFilters.isEmpty { n += 1 }
        if advancedOn && !advanced.isEmpty { n += 1 }
        if mode != .all { n += 1 }
        if selectedLibraryId != nil { n += 1 }
        return n
    }

    func load() async {
        async let mem = XIService.shared.allXiMemories()
        async let libs = XIService.shared.loadLibraries()
        memories = await mem
        libraries = await libs
        loading = false
    }

    func reloadLibraries() async { libraries = await XIService.shared.loadLibraries() }

    // MARK: filtering

    /// Memory ids hidden because they live in a locked library (and we're not
    /// currently viewing that library).
    private var lockedHiddenIds: Set<String> {
        guard selectedLibraryId == nil else { return [] }   // viewing a library shows its memories
        var ids = Set<String>()
        for lib in libraries where lib.isLocked {
            for m in lib.memories(from: memories) { ids.insert(m.id) }
        }
        return ids
    }

    var filtered: [XIMemory] {
        var out = memories

        // Locked-library hiding / library scoping.
        if let lib = selectedLibrary {
            let ids = Set(lib.memories(from: memories).map(\.id))
            out = out.filter { ids.contains($0.id) }
        } else {
            let hidden = lockedHiddenIds
            if !hidden.isEmpty { out = out.filter { !hidden.contains($0.id) } }
        }

        // Mode.
        if mode == .board { out = out.filter { $0.mode == "board" } }
        if mode == .versus { out = out.filter { $0.mode == "versus" } }

        // Boolean hashtags (left-to-right AND/OR, like the web).
        if !tagFilters.isEmpty {
            out = out.filter { m in
                let tags = Set(m.hashtags.map { xiNormTag($0) })
                var result = tags.contains(tagFilters[0].tag)
                for f in tagFilters.dropFirst() {
                    let has = tags.contains(f.tag)
                    result = f.op == .and ? (result && has) : (result || has)
                }
                return result
            }
        }

        // Advanced boolean search.
        if advancedOn && !advanced.isEmpty {
            out = out.filter { advanced.matches($0) }
        }

        // Plain text search (title + content + hashtags).
        let q = search.xiTrimmed.lowercased()
        if !q.isEmpty {
            out = out.filter { m in
                m.title.lowercased().contains(q) || m.content.lowercased().contains(q)
                    || m.hashtags.contains { $0.lowercased().contains(q.replacingOccurrences(of: "#", with: "")) }
            }
        }

        // Sort by timestamp.
        out.sort { sort == .newest ? $0.timestamp > $1.timestamp : $0.timestamp < $1.timestamp }
        return out
    }

    // MARK: hashtag cloud

    /// All hashtags with counts, most frequent first.
    func hashtagCloud() -> [(tag: String, count: Int)] {
        var map: [String: Int] = [:]
        for m in memories {
            for t in m.hashtags {
                let n = xiNormTag(t)
                guard !n.isEmpty else { continue }
                map[n, default: 0] += 1
            }
        }
        return map.map { (tag: $0.key, count: $0.value) }.sorted { $0.count > $1.count }
    }

    // MARK: boolean hashtag actions

    func toggleTag(_ raw: String) {
        let tag = xiNormTag(raw)
        guard !tag.isEmpty else { return }
        if let i = tagFilters.firstIndex(where: { $0.tag == tag }) {
            tagFilters.remove(at: i)
        } else {
            tagFilters.append(HashtagFilter(tag: tag, op: .and))
        }
    }

    func isTagActive(_ raw: String) -> Bool { tagFilters.contains { $0.tag == xiNormTag(raw) } }

    func flipOp(_ id: String) {
        guard let i = tagFilters.firstIndex(where: { $0.id == id }), i > 0 else { return }
        tagFilters[i].op = tagFilters[i].op == .and ? .or : .and
    }

    func removeTag(_ id: String) { tagFilters.removeAll { $0.id == id } }

    func clearAllFilters() {
        search = ""; tagFilters = []; advanced = XISearchLogic(); advancedOn = false
        mode = .all; selectedLibraryId = nil
    }

    // MARK: libraries

    func selectLibrary(_ id: String?) { selectedLibraryId = (selectedLibraryId == id) ? nil : id }

    func saveAdvancedAsLibrary(name: String) async {
        guard !advanced.isEmpty else { return }
        await XIService.shared.createLibrary(name: name, searchLogic: advanced)
        await reloadLibraries()
    }

    func createManualLibrary(name: String, ids: [String], isLocked: Bool) async {
        await XIService.shared.createLibrary(name: name, manualMemoryIds: ids, isLocked: isLocked)
        await reloadLibraries()
    }

    func setLocked(_ lib: XILibrary, _ locked: Bool) async {
        await XIService.shared.updateLibrary(lib.id, ["isLocked": locked])
        await reloadLibraries()
    }

    func renameLibrary(_ lib: XILibrary, to name: String) async {
        await XIService.shared.updateLibrary(lib.id, ["name": name])
        await reloadLibraries()
    }

    func deleteLibrary(_ lib: XILibrary) async {
        if selectedLibraryId == lib.id { selectedLibraryId = nil }
        await XIService.shared.deleteLibrary(lib.id)
        await reloadLibraries()
    }

    func addSelectedToLibrary(_ lib: XILibrary) async {
        let merged = Array(Set(lib.manualMemoryIds).union(selectedIds))
        await XIService.shared.updateLibrary(lib.id, ["manualMemoryIds": merged])
        await reloadLibraries()
        exitSelectMode()
    }

    // MARK: select mode / bulk actions

    func toggleSelectMode() {
        selectMode.toggle()
        if !selectMode { selectedIds = [] }
    }

    func exitSelectMode() { selectMode = false; selectedIds = [] }

    func toggleSelected(_ id: String) {
        if selectedIds.contains(id) { selectedIds.remove(id) } else { selectedIds.insert(id) }
    }

    func bulkDelete() async {
        let ids = selectedIds
        for id in ids { await XIService.shared.deleteMemory(id) }
        memories.removeAll { ids.contains($0.id) }
        exitSelectMode()
    }

    /// Hashtags present across the current selection (for the "remove" picker).
    var tagsInSelection: [String] {
        var set = Set<String>()
        for m in memories where selectedIds.contains(m.id) {
            for t in m.hashtags { set.insert(xiNormTag(t)) }
        }
        return set.sorted()
    }

    func bulkAddTag(_ raw: String) async {
        let tag = xiNormTag(raw)
        guard !tag.isEmpty else { return }
        for i in memories.indices where selectedIds.contains(memories[i].id) {
            var tags = memories[i].hashtags
            if !tags.contains(where: { xiNormTag($0) == tag }) {
                tags.append(tag)
                await XIService.shared.updateMemoryHashtags(memories[i].id, tags)
                memories[i] = memories[i].withHashtags(tags)
            }
        }
        exitSelectMode()
    }

    func bulkRemoveTag(_ raw: String) async {
        let tag = xiNormTag(raw)
        for i in memories.indices where selectedIds.contains(memories[i].id) {
            let tags = memories[i].hashtags.filter { xiNormTag($0) != tag }
            if tags.count != memories[i].hashtags.count {
                await XIService.shared.updateMemoryHashtags(memories[i].id, tags)
                memories[i] = memories[i].withHashtags(tags)
            }
        }
        exitSelectMode()
    }
}
