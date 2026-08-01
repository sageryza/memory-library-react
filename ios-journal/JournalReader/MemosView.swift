import SwiftUI
import UIKit
import Combine
import AVFoundation
import FirebaseAuth
import FirebaseFunctions
import FirebaseStorage

/// Readable palette for the Memos tab. Deeper tints than the old inline colors so
/// text/discs aren't light-on-light (the "white on white / gray on gray" bug).
enum MemoTheme {
    static let paper  = Color(red: 0.988, green: 0.973, blue: 0.953) // cream
    static let ink    = Color(red: 0.13, green: 0.12, blue: 0.11)    // near-black body
    static let sub    = Color(white: 0.34)                            // secondary text
    static let line   = Color(white: 0.82)
    static let dream  = Color(red: 0.45, green: 0.36, blue: 0.66)     // deep violet
    static let memo   = Color(red: 0.60, green: 0.44, blue: 0.20)     // deep amber/brown
    static let entry  = Color(red: 0.33, green: 0.45, blue: 0.32)     // deep green (journal text)
    static let accent = Color(red: 0.84, green: 0.44, blue: 0.60)     // rose (semantic ON)
    static let gold   = Color(red: 0.85, green: 0.62, blue: 0.20)     // star
}

/// One hit from the `searchArchive` Cloud Function — a memo (playable) or a
/// journal entry (jumps to the Timeline).
struct ArchiveHit: Identifiable {
    let source: String
    let id: String
    let file: String?
    let dur: Int?
    let date: String?
    let title: String?
    let cat: String?
    let type: String?
    let snippet: String?
    let score: Double
}

/// Sage's per-memo overlay (starred / hidden / renamed), synced via the
/// `memoPrefs` Cloud Function so it survives reinstalls and can reach Deck Factory.
struct MemoPref {
    var starred = false
    var hidden = false
    var narration = false   // flagged to add to Story Room (as narration)
    var name: String?
}

/// Backs the Memos tab: the full memo list (newest first, browse + keyword), the
/// per-memo prefs, and semantic search over the archive.
@MainActor
final class MemosStore: ObservableObject {
    enum Source: String, CaseIterable, Identifiable {
        case both = "both", memo = "memo", journal = "journal"
        var id: String { rawValue }
        var label: String { self == .both ? "Both" : (self == .memo ? "Memos" : "Journal") }
    }
    enum Load: Equatable { case idle, loading, ready, failed(String) }

    @Published var semantic = false          // false = keyword (text), true = meaning
    @Published var source: Source = .both    // only used in semantic mode
    @Published var query = ""
    @Published var organize = false          // reveals star/hide controls + hidden memos
    @Published var storyFilter = false       // show only memos flagged for Story Room
    @Published var monthFilter: String?      // "yyyy-MM" — browse list shows only that month

    @Published var listLoad: Load = .idle
    @Published var memos: [VoiceEntry] = []   // all, newest first
    @Published var prefs: [String: MemoPref] = [:]

    @Published var searching = false
    @Published var searchError: String?
    @Published var hits: [ArchiveHit] = []

    private lazy var functions = Functions.functions()
    private let storage = Storage.storage()

    // MARK: load

    func loadIfNeeded() {
        loadPrefs()
        switch listLoad { case .ready, .loading: return; default: load() }
    }

    func load() {
        listLoad = .loading
        Task {
            do {
                try await ensureAuth()
                let data = try await storage.reference(withPath: "memo-audio/manifest.json")
                    .data(maxSize: 25 * 1024 * 1024)
                struct M: Codable { let memos: [VoiceEntry] }
                let all = try JSONDecoder().decode(M.self, from: data).memos
                memos = all
                    .filter { $0.cat != "empty" && ($0.date ?? "").isEmpty == false }
                    .sorted { ($0.date ?? "") > ($1.date ?? "") }
                listLoad = .ready
            } catch {
                listLoad = .failed(error.localizedDescription)
            }
        }
    }

    func loadPrefs() {
        Task {
            do {
                try await ensureAuth()
                let res = try await functions.httpsCallable("memoPrefs").call(["mode": "get"])
                let raw = (res.data as? [String: Any])?["prefs"] as? [String: [String: Any]] ?? [:]
                var m: [String: MemoPref] = [:]
                for (id, v) in raw {
                    m[id] = MemoPref(starred: (v["starred"] as? Bool) ?? false,
                                     hidden: (v["hidden"] as? Bool) ?? false,
                                     narration: (v["narration"] as? Bool) ?? false,
                                     name: v["name"] as? String)
                }
                prefs = m
            } catch { /* prefs stay empty; browse still works */ }
        }
    }

    // MARK: prefs writes (optimistic + synced)

    func pref(_ id: String) -> MemoPref { prefs[id] ?? MemoPref() }

    func setPref(id: String, starred: Bool? = nil, hidden: Bool? = nil,
                 narration: Bool? = nil, name: String? = nil) {
        var p = prefs[id] ?? MemoPref()
        if let s = starred { p.starred = s }
        if let h = hidden { p.hidden = h }
        if let nr = narration { p.narration = nr }
        if let n = name { p.name = n }
        prefs[id] = p  // optimistic

        var payload: [String: Any] = ["mode": "set", "id": id]
        if let s = starred { payload["starred"] = s }
        if let h = hidden { payload["hidden"] = h }
        if let nr = narration { payload["narration"] = nr }
        if let n = name { payload["name"] = n }
        Task {
            do { try await ensureAuth(); _ = try await functions.httpsCallable("memoPrefs").call(payload) }
            catch { /* keep the optimistic local value */ }
        }
    }

    /// Display name: the custom name if set, else the auto title.
    func name(for entry: VoiceEntry) -> String {
        let n = prefs[entry.id]?.name
        if let n, !n.isEmpty { return n }
        return entry.title ?? "Untitled"
    }

    // MARK: browse list

    /// Keyword filter over the memos (empty query → all).
    private var keywordResults: [VoiceEntry] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return memos }
        return memos.filter {
            (name(for: $0).lowercased().contains(q))
            || ($0.transcript?.lowercased().contains(q) ?? false)
            || ($0.desc?.lowercased().contains(q) ?? false)
        }
    }

    /// The months that actually have memos, grouped by year, newest first —
    /// what the calendar menu offers. Keys are "yyyy-MM".
    var monthsByYear: [(year: String, months: [String])] {
        var seen = Set<String>()
        var all: [String] = []
        for m in memos {
            guard let d = m.date, d.count >= 7 else { continue }
            let ym = String(d.prefix(7))
            if seen.insert(ym).inserted { all.append(ym) }
        }
        all.sort(by: >)
        var years: [String] = []
        var map: [String: [String]] = [:]
        for ym in all {
            let y = String(ym.prefix(4))
            if map[y] == nil { map[y] = []; years.append(y) }
            map[y]?.append(ym)
        }
        return years.map { ($0, map[$0] ?? []) }
    }

    /// What the browse list shows: hidden dropped (unless Organize is on),
    /// starred floated to the top, otherwise newest-first.
    var browseItems: [VoiceEntry] {
        var base = organize ? keywordResults : keywordResults.filter { !pref($0.id).hidden }
        if storyFilter { base = base.filter { pref($0.id).narration } }
        if let m = monthFilter { base = base.filter { ($0.date ?? "").hasPrefix(m) } }
        return base.sorted { a, b in
            let sa = pref(a.id).starred, sb = pref(b.id).starred
            if sa != sb { return sa && !sb }
            return (a.date ?? "") > (b.date ?? "")
        }
    }

    // MARK: semantic search

    func runSemantic() {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard semantic, !q.isEmpty else { hits = []; return }
        searching = true; searchError = nil
        Task {
            do {
                try await ensureAuth()
                let res = try await functions.httpsCallable("searchArchive").call([
                    "query": q, "source": source.rawValue, "limit": 40,
                ])
                let raw = (res.data as? [String: Any])?["results"] as? [[String: Any]] ?? []
                hits = raw.map { d in
                    ArchiveHit(source: (d["source"] as? String) ?? "memo",
                               id: (d["id"] as? String) ?? UUID().uuidString,
                               file: d["file"] as? String, dur: d["dur"] as? Int,
                               date: d["date"] as? String, title: d["title"] as? String,
                               cat: d["cat"] as? String, type: d["type"] as? String,
                               snippet: d["snippet"] as? String, score: (d["score"] as? Double) ?? 0)
                }
                searching = false
            } catch {
                searchError = error.localizedDescription; searching = false
            }
        }
    }

    /// The full manifest entry for an id (semantic hits lack the transcript).
    func fullEntry(_ id: String) -> VoiceEntry? { memos.first { $0.id == id } }

    func audioURL(file: String) async throws -> URL {
        try await ensureAuth()
        return try await storage.reference(withPath: "memo-audio/\(file)").downloadURL()
    }

    // MARK: local audio (waveform + download)

    private var audioCacheDir: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("memo-audio", isDirectory: true)
    }

    private func cachePath(for entry: VoiceEntry) -> URL {
        audioCacheDir.appendingPathComponent((entry.file as NSString).lastPathComponent)
    }

    /// The already-downloaded recording, if we have it (no network).
    func cachedAudioFile(for entry: VoiceEntry) -> URL? {
        let dest = cachePath(for: entry)
        return FileManager.default.fileExists(atPath: dest.path) ? dest : nil
    }

    /// The recording as a local file — downloaded once into the cache, reused
    /// after that (the waveform and the Download button both read this).
    func localAudioFile(for entry: VoiceEntry) async throws -> URL {
        let dest = cachePath(for: entry)
        if FileManager.default.fileExists(atPath: dest.path) { return dest }
        try await ensureAuth()
        try FileManager.default.createDirectory(at: audioCacheDir, withIntermediateDirectories: true)
        _ = try await storage.reference(withPath: "memo-audio/\(entry.file)").writeAsync(toFile: dest)
        return dest
    }

    /// A copy of the recording named after the memo (what lands in Files /
    /// AirDrop when Sophie downloads it), in the temp dir.
    func shareFile(for entry: VoiceEntry) async throws -> URL {
        let local = try await localAudioFile(for: entry)
        let ext = local.pathExtension.isEmpty ? "m4a" : local.pathExtension
        var base = name(for: entry)
        if let d = entry.date, !d.isEmpty { base = "\(d) \(base)" }
        let bad = CharacterSet(charactersIn: "/\\:?%*|\"<>")
        let safe = base.components(separatedBy: bad).joined(separator: "-")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let tmp = FileManager.default.temporaryDirectory
            .appendingPathComponent("\(safe.isEmpty ? entry.id : safe).\(ext)")
        try? FileManager.default.removeItem(at: tmp)
        try FileManager.default.copyItem(at: local, to: tmp)
        return tmp
    }

    private func ensureAuth() async throws {
        if Auth.auth().currentUser == nil { try await Auth.auth().signInAnonymously() }
    }
}

/// The Voice Memos tab: browse newest-first, filter by text, ✨ to search by
/// meaning, and an Organize mode to star / hide. Tap a memo for its detail screen.
struct MemosView: View {
    @EnvironmentObject private var router: AppRouter
    @StateObject private var store = MemosStore()
    @StateObject private var player = VoicePlayer()
    @FocusState private var focused: Bool
    @State private var selected: VoiceEntry?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                header
                searchField
                if store.semantic {
                    Picker("Source", selection: $store.source) {
                        ForEach(MemosStore.Source.allCases) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal, 12).padding(.bottom, 8)
                    .onChange(of: store.source) { _, _ in store.runSemantic() }
                }
                content
            }
            .background(MemoTheme.paper.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(item: $selected) { entry in
                MemoDetailView(entry: entry, store: store)
            }
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { dismissKeyboard() }.tint(MemoTheme.accent)
                }
            }
        }
        .onAppear { store.loadIfNeeded() }
        .onChange(of: store.semantic) { _, on in if on { store.runSemantic() } else { store.hits = [] } }
    }

    private var header: some View {
        HStack(spacing: 8) {
            Text("Voice Memos")
                .font(.system(size: 22, weight: .bold)).foregroundColor(MemoTheme.ink)
            Spacer()
            // Story Room filter: show only the memos flagged for Story Room.
            iconToggle(on: store.storyFilter, icon: "books.vertical",
                       label: "Story Room", onColor: MemoTheme.entry) {
                withAnimation(.easeInOut(duration: 0.15)) { store.storyFilter.toggle() }
            }
            iconToggle(on: store.organize, icon: "checklist",
                       label: "Organize", onColor: MemoTheme.accent) {
                withAnimation(.easeInOut(duration: 0.15)) { store.organize.toggle() }
            }
        }
        .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 4)
    }

    private func iconToggle(on: Bool, icon: String, label: String, onColor: Color,
                            action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Image(systemName: icon).font(.system(size: 13, weight: .semibold))
                Text(label).font(.system(size: 12, weight: .semibold))
            }
            .foregroundColor(on ? .white : MemoTheme.sub)
            .padding(.horizontal, 9).padding(.vertical, 6)
            .background(RoundedRectangle(cornerRadius: 6).fill(on ? onColor : Color.white))
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(on ? .clear : MemoTheme.line))
        }
        .buttonStyle(.plain)
    }

    /// Reliable keyboard dismissal — clears SwiftUI focus AND resigns the first
    /// responder, so it never needs a second tap (the field can't re-grab focus).
    private func dismissKeyboard() {
        focused = false
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder),
                                        to: nil, from: nil, for: nil)
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundColor(MemoTheme.sub)
            TextField("", text: $store.query)
                .focused($focused)
                .foregroundColor(MemoTheme.ink)
                .submitLabel(.search)
                .autocorrectionDisabled()
                .accessibilityLabel(store.semantic ? "Search by meaning" : "Search your memos")
                .onSubmit { dismissKeyboard(); if store.semantic { store.runSemantic() } }
            if !store.query.isEmpty {
                Button { store.query = ""; store.hits = [] } label: {
                    Image(systemName: "xmark.circle.fill").foregroundColor(MemoTheme.sub.opacity(0.7))
                }.buttonStyle(.plain)
            }
            monthMenu
            Button { store.semantic.toggle() } label: {
                Image(systemName: "sparkles")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(store.semantic ? .white : MemoTheme.sub)
                    .frame(width: 32, height: 32)
                    .background(RoundedRectangle(cornerRadius: 6)
                        .fill(store.semantic ? MemoTheme.accent : Color.white))
                    .overlay(RoundedRectangle(cornerRadius: 6)
                        .stroke(store.semantic ? .clear : MemoTheme.line))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(store.semantic ? "Meaning search on" : "Meaning search off")
        }
        .padding(.horizontal, 12).padding(.vertical, 9)
        .background(RoundedRectangle(cornerRadius: 8).fill(Color.white))
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(MemoTheme.line))
        .padding(.horizontal, 12).padding(.top, 4).padding(.bottom, 8)
    }

    /// Filter the browse list to one month — a calendar menu grouped by year,
    /// newest first; "All months" clears it.
    private var monthMenu: some View {
        Menu {
            Button { store.monthFilter = nil } label: {
                if store.monthFilter == nil { Label("All months", systemImage: "checkmark") }
                else { Text("All months") }
            }
            ForEach(store.monthsByYear, id: \.year) { group in
                Menu(group.year) {
                    ForEach(group.months, id: \.self) { ym in
                        Button { store.monthFilter = ym } label: {
                            if store.monthFilter == ym { Label(VoiceDate.monthName(ym), systemImage: "checkmark") }
                            else { Text(VoiceDate.monthName(ym)) }
                        }
                    }
                }
            }
        } label: {
            Image(systemName: "calendar")
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(store.monthFilter != nil ? .white : MemoTheme.sub)
                .frame(width: 32, height: 32)
                .background(RoundedRectangle(cornerRadius: 6)
                    .fill(store.monthFilter != nil ? MemoTheme.accent : Color.white))
                .overlay(RoundedRectangle(cornerRadius: 6)
                    .stroke(store.monthFilter != nil ? .clear : MemoTheme.line))
        }
        .accessibilityLabel(store.monthFilter.map { "Showing \(VoiceDate.monthYearLabel($0))" } ?? "Filter by month")
    }

    @ViewBuilder
    private var content: some View {
        let hasQuery = !store.query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        if store.semantic && hasQuery { semanticResults } else { browseList }
    }

    @ViewBuilder
    private var browseList: some View {
        switch store.listLoad {
        case .idle, .loading:
            centered { ProgressView("Loading your memos…").tint(MemoTheme.sub) }
        case .failed(let m):
            centered {
                VStack(spacing: 12) {
                    Image(systemName: "wifi.exclamationmark").font(.system(size: 34)).foregroundColor(MemoTheme.sub)
                    Text("Couldn’t load your memos").font(.headline).foregroundColor(MemoTheme.ink)
                    Text(m).font(.footnote).foregroundColor(MemoTheme.sub).multilineTextAlignment(.center)
                    Button("Try again") { store.load() }.buttonStyle(.bordered).tint(MemoTheme.accent)
                }.padding(32)
            }
        case .ready:
            let items = store.browseItems
            if items.isEmpty {
                centered { Text("No memos match.").foregroundColor(MemoTheme.sub) }
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(items) { entry in
                            VStack(spacing: 0) {
                                MemoRow(entry: entry, store: store, player: player) { selected = $0 }
                                Divider().overlay(MemoTheme.line).padding(.leading, 66)
                            }
                        }
                    }
                    .padding(.bottom, 24)
                }
                // The shared Deck Factory pill: drives this list's scroll view
                // continuously (five speeds); a tap anywhere on content stops it.
                .overlay(alignment: .topTrailing) {
                    AutoScrollPill().padding(.trailing, 8).padding(.top, 8)
                }
            }
        }
    }

    @ViewBuilder
    private var semanticResults: some View {
        if store.searching {
            centered { ProgressView("Searching…").tint(MemoTheme.sub) }
        } else if let e = store.searchError {
            centered {
                VStack(spacing: 12) {
                    Image(systemName: "wifi.exclamationmark").font(.system(size: 34)).foregroundColor(MemoTheme.sub)
                    Text("Couldn’t search").font(.headline).foregroundColor(MemoTheme.ink)
                    Text(e).font(.footnote).foregroundColor(MemoTheme.sub).multilineTextAlignment(.center)
                    Button("Try again") { store.runSemantic() }.buttonStyle(.bordered).tint(MemoTheme.accent)
                }.padding(32)
            }
        } else if store.hits.isEmpty {
            centered { Text("Nothing found.").foregroundColor(MemoTheme.sub) }
        } else {
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(store.hits) { hit in
                        if hit.source == "memo" {
                            MemoRow(entry: store.fullEntry(hit.id) ?? hit.asEntry,
                                    store: store, player: player, snippet: hit.snippet) { selected = $0 }
                        } else {
                            JournalHitRow(hit: hit) { page in router.openTimeline(page: page) }
                        }
                        Divider().overlay(MemoTheme.line).padding(.leading, 66)
                    }
                }.padding(.bottom, 24)
            }
        }
    }

    private func centered<V: View>(@ViewBuilder _ inner: () -> V) -> some View {
        VStack { Spacer(); inner(); Spacer() }.frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

extension ArchiveHit {
    /// A playable VoiceEntry from a memo hit (semantic results carry `file`).
    var asEntry: VoiceEntry {
        VoiceEntry(id: id, file: file ?? "", date: date, cat: cat ?? "journal",
                   title: title, desc: snippet, transcript: nil, dur: dur)
    }
}

/// One memo row: play disc, name, chip/date, and (in Organize mode) star + hide
/// controls. Tapping the row opens its detail screen.
private struct MemoRow: View {
    let entry: VoiceEntry
    @ObservedObject var store: MemosStore
    @ObservedObject var player: VoicePlayer
    var snippet: String? = nil
    var onOpen: (VoiceEntry) -> Void

    @State private var loading = false
    @State private var audioError: String?

    private var isThis: Bool { player.currentID == entry.id }
    private var tint: Color { entry.cat == "dream" ? MemoTheme.dream : MemoTheme.memo }
    private var p: MemoPref { store.pref(entry.id) }
    private var chip: String {
        switch entry.cat {
        case "dream": return "Dream"
        case "journal": return "Journal"
        default: return entry.cat.capitalized
        }
    }
    private var body2: String? { snippet ?? entry.desc }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            playButton
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    if p.starred {
                        Image(systemName: "star.fill").font(.system(size: 12)).foregroundColor(MemoTheme.gold)
                    }
                    if p.narration {
                        Image(systemName: "books.vertical.fill").font(.system(size: 12)).foregroundColor(MemoTheme.entry)
                    }
                    Text(store.name(for: entry))
                        .font(.system(size: 16, weight: .semibold)).foregroundColor(MemoTheme.ink)
                        .fixedSize(horizontal: false, vertical: true)
                }
                HStack(spacing: 8) {
                    Text(chip)
                        .font(.system(size: 11, weight: .bold)).foregroundColor(.white)
                        .padding(.horizontal, 8).padding(.vertical, 2)
                        .background(RoundedRectangle(cornerRadius: 5).fill(tint))
                    Text(VoiceDate.pretty(entry.date))
                        .font(.system(size: 12, weight: .medium)).foregroundColor(MemoTheme.sub)
                    if let d = entry.dur {
                        Text(VoiceDate.duration(d))
                            .font(.system(size: 12, weight: .medium)).foregroundColor(MemoTheme.sub)
                    }
                }
                if let b = body2, !b.isEmpty {
                    Text(b).font(.system(size: 14)).foregroundColor(MemoTheme.sub)
                        .lineLimit(2).fixedSize(horizontal: false, vertical: true)
                }
                if let audioError {
                    Text(audioError).font(.system(size: 12)).foregroundColor(.red)
                }
            }
            Spacer(minLength: 0)
            if store.organize {
                organizeControls
            } else {
                Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold))
                    .foregroundColor(MemoTheme.sub.opacity(0.6)).padding(.top, 4)
            }
        }
        .opacity(store.organize && p.hidden ? 0.45 : 1)
        .padding(.horizontal, 16).padding(.vertical, 12)
        .contentShape(Rectangle())
        .onTapGesture { onOpen(entry) }
    }

    private var organizeControls: some View {
        HStack(spacing: 6) {
            orgButton(on: p.starred, onIcon: "star.fill", offIcon: "star", onColor: MemoTheme.gold,
                      label: p.starred ? "Unstar" : "Star") { store.setPref(id: entry.id, starred: !p.starred) }
            orgButton(on: p.narration, onIcon: "books.vertical.fill", offIcon: "books.vertical", onColor: MemoTheme.entry,
                      label: p.narration ? "Remove from Story Room" : "Add to Story Room") { store.setPref(id: entry.id, narration: !p.narration) }
            orgButton(on: p.hidden, onIcon: "eye.slash.fill", offIcon: "eye.slash", onColor: MemoTheme.accent,
                      label: p.hidden ? "Unhide" : "Hide") { store.setPref(id: entry.id, hidden: !p.hidden) }
        }
    }

    private func orgButton(on: Bool, onIcon: String, offIcon: String, onColor: Color,
                           label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: on ? onIcon : offIcon)
                .font(.system(size: 15)).foregroundColor(on ? onColor : MemoTheme.sub)
                .frame(width: 34, height: 34)
                .background(RoundedRectangle(cornerRadius: 8).fill(Color.white))
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(MemoTheme.line))
        }.buttonStyle(.plain).accessibilityLabel(label)
    }

    private var playButton: some View {
        Button(action: play) {
            ZStack {
                RoundedRectangle(cornerRadius: 10, style: .continuous).fill(tint).frame(width: 40, height: 40)
                if loading { ProgressView().tint(.white) }
                else {
                    Image(systemName: (isThis && player.isPlaying) ? "pause.fill" : "play.fill")
                        .font(.system(size: 15, weight: .bold)).foregroundColor(.white)
                        .offset(x: (isThis && player.isPlaying) ? 0 : 1)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(isThis && player.isPlaying ? "Pause" : "Play")
    }

    private func play() {
        if isThis { player.togglePause(); return }
        guard !entry.file.isEmpty else { audioError = "Couldn’t find this recording."; return }
        loading = true; audioError = nil
        Task {
            do { player.play(entry, url: try await store.audioURL(file: entry.file)) }
            catch { audioError = "Couldn’t play this recording." }
            loading = false
        }
    }
}

/// A journal entry hit (semantic): tap to jump to it on the Timeline.
private struct JournalHitRow: View {
    let hit: ArchiveHit
    let onOpen: (Int) -> Void

    private var page: Int? {
        guard hit.id.hasPrefix("p") else { return nil }
        return Int(hit.id.dropFirst().prefix { $0 != "-" })
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 10, style: .continuous).fill(MemoTheme.entry.opacity(0.20)).frame(width: 40, height: 40)
                Image(systemName: "text.alignleft").font(.system(size: 15, weight: .semibold)).foregroundColor(MemoTheme.entry)
            }
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text((hit.type ?? "entry").capitalized)
                        .font(.system(size: 11, weight: .bold)).foregroundColor(.white)
                        .padding(.horizontal, 8).padding(.vertical, 2)
                        .background(RoundedRectangle(cornerRadius: 5).fill(MemoTheme.entry))
                    Text(VoiceDate.pretty(hit.date))
                        .font(.system(size: 12, weight: .medium)).foregroundColor(MemoTheme.sub)
                }
                if let s = hit.snippet, !s.isEmpty {
                    Text(s).font(.system(size: 14)).foregroundColor(MemoTheme.sub)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 0)
            if page != nil {
                Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold))
                    .foregroundColor(MemoTheme.sub.opacity(0.6)).padding(.top, 4)
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
        .contentShape(Rectangle())
        .onTapGesture { if let p = page { onOpen(p) } }
    }
}

/// A downloaded copy of a recording, ready for the share sheet.
private struct SharedFile: Identifiable {
    let id = UUID()
    let url: URL
}

/// The iOS share sheet (save to Files, AirDrop, etc.) for a downloaded memo.
private struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}
}

/// One memo's own screen: play it (waveform + scrub + 15s skips), download the
/// recording, read its transcript, rename it, star/hide it, and (soon) send it
/// to a Deck Factory movie.
struct MemoDetailView: View {
    let entry: VoiceEntry
    @ObservedObject var store: MemosStore
    @StateObject private var player = VoicePlayer()

    @State private var name = ""
    @State private var loading = false
    @State private var audioError: String?
    @FocusState private var editingName: Bool

    // Playback extras: the waveform's amplitude buckets (computed from the
    // downloaded audio), the finger's scrub position while dragging, and the
    // downloaded copy handed to the share sheet.
    @State private var waveSamples: [Float]?
    @State private var scrubbing: Double?
    @State private var shareItem: SharedFile?
    @State private var preparingShare = false

    /// Transcript split into paragraphs (by line breaks, else ~320-char
    /// chunks) so it reads comfortably.
    private var transcriptParas: [String] {
        guard let t = full.transcript, !t.isEmpty else { return [] }
        let byLine = t.components(separatedBy: "\n").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        if byLine.count > 1 { return byLine }
        var chunks: [String] = []; var cur = ""
        for s in t.components(separatedBy: ". ") {
            let piece = s.hasSuffix(".") ? s : s + ". "
            if cur.count + piece.count > 320 && !cur.isEmpty { chunks.append(cur.trimmingCharacters(in: .whitespaces)); cur = piece }
            else { cur += piece }
        }
        if !cur.isEmpty { chunks.append(cur.trimmingCharacters(in: .whitespaces)) }
        return chunks
    }

    private var full: VoiceEntry { store.fullEntry(entry.id) ?? entry }
    private var p: MemoPref { store.pref(entry.id) }
    private var tint: Color { entry.cat == "dream" ? MemoTheme.dream : MemoTheme.memo }
    private var isThis: Bool { player.currentID == entry.id }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                topBlock

                Divider().overlay(MemoTheme.line)

                // Transcript
                if transcriptParas.isEmpty {
                    Text("No transcript.").font(.system(size: 14)).foregroundColor(MemoTheme.sub)
                } else {
                    Text("Transcript").font(.system(size: 13, weight: .bold)).foregroundColor(MemoTheme.sub)
                    ForEach(Array(transcriptParas.enumerated()), id: \.offset) { item in
                        Text(item.element).font(.system(size: 16)).foregroundColor(MemoTheme.ink.opacity(0.92))
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }

                Divider().overlay(MemoTheme.line)

                sendToBlock
            }
            .padding(16)
        }
        .background(MemoTheme.paper.ignoresSafeArea())
        // The shared Deck Factory pill (top-right, like every Deck Factory
        // page); the top block reserves that corner so nothing sits under it.
        .overlay(alignment: .topTrailing) {
            AutoScrollPill().padding(.trailing, 8).padding(.top, 8)
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") {
                    editingName = false
                    UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
                    commitName()
                }.tint(MemoTheme.accent)
            }
        }
        .sheet(item: $shareItem) { item in ShareSheet(items: [item.url]) }
        .onAppear {
            name = store.name(for: entry)
            loadWaveform()
        }
        .onDisappear { commitName() }
    }

    private var topBlock: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .center, spacing: 14) {
                playButton
                VStack(alignment: .leading, spacing: 4) {
                    TextField("Name this memo", text: $name)
                        .font(.system(size: 20, weight: .bold)).foregroundColor(MemoTheme.ink)
                        .focused($editingName)
                        .submitLabel(.done)
                        .onSubmit { commitName() }
                    HStack(spacing: 8) {
                        Text(VoiceDate.pretty(entry.date))
                            .font(.system(size: 13, weight: .medium)).foregroundColor(MemoTheme.sub)
                        if let d = entry.dur {
                            Text(VoiceDate.duration(d))
                                .font(.system(size: 13, weight: .medium)).foregroundColor(MemoTheme.sub)
                        }
                    }
                }
            }

            playerBlock

            if let audioError {
                Text(audioError).font(.system(size: 13)).foregroundColor(.red)
            }
            HStack(spacing: 8) {
                toggleChip(on: p.starred, onIcon: "star.fill", offIcon: "star",
                           label: p.starred ? "Starred" : "Star", onColor: MemoTheme.gold) {
                    store.setPref(id: entry.id, starred: !p.starred)
                }
                toggleChip(on: p.narration, onIcon: "books.vertical.fill", offIcon: "books.vertical",
                           label: "Story Room", onColor: MemoTheme.entry) {
                    store.setPref(id: entry.id, narration: !p.narration)
                }
                toggleChip(on: p.hidden, onIcon: "eye.slash.fill", offIcon: "eye.slash",
                           label: p.hidden ? "Hidden" : "Hide", onColor: MemoTheme.accent) {
                    store.setPref(id: entry.id, hidden: !p.hidden)
                }
            }
            downloadButton
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        // Reserve the pill's corner (Deck Factory rule: nothing tappable or
        // draggable under the fixed top-right pill).
        .padding(.trailing, 52)
    }

    // MARK: playback (waveform + scrub + skips)

    /// The best total we know: the player's real duration once loaded, else the
    /// manifest's stored seconds.
    private var totalSeconds: Double {
        if isThis, player.duration > 0 { return player.duration }
        return Double(full.dur ?? 0)
    }

    private var playedFraction: Double {
        if let s = scrubbing { return s }
        guard isThis, totalSeconds > 0 else { return 0 }
        return min(1, max(0, player.currentTime / totalSeconds))
    }

    private var playerBlock: some View {
        VStack(spacing: 6) {
            MemoWaveformView(samples: waveSamples, progress: playedFraction, tint: tint,
                             onScrub: { f in scrubbing = f },
                             onScrubEnd: { f in
                                 scrubbing = nil
                                 seek(toFraction: f)
                             })
            HStack(spacing: 8) {
                Text(VoiceDate.duration(Int((isThis ? player.currentTime : 0).rounded())))
                    .font(.system(size: 12, weight: .medium)).monospacedDigit()
                    .foregroundColor(MemoTheme.sub)
                Spacer()
                skipButton(-15, icon: "gobackward.15", label: "Back 15 seconds")
                skipButton(15, icon: "goforward.15", label: "Forward 15 seconds")
                Spacer()
                Text(VoiceDate.duration(Int(totalSeconds.rounded())))
                    .font(.system(size: 12, weight: .medium)).monospacedDigit()
                    .foregroundColor(MemoTheme.sub)
            }
        }
    }

    private func skipButton(_ seconds: Double, icon: String, label: String) -> some View {
        Button {
            if isThis { player.skip(seconds) } else { play() }
        } label: {
            Image(systemName: icon)
                .font(.system(size: 20, weight: .medium))
                .foregroundColor(MemoTheme.ink)
                .frame(width: 44, height: 36)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    /// Jump to a waveform position. If this memo isn't loaded in the player
    /// yet, start it and land on the picked spot.
    private func seek(toFraction f: Double) {
        let total = totalSeconds
        guard total > 0 else { return }
        let t = f * total
        if isThis {
            player.seek(to: t)
        } else {
            play(startingAt: t)
        }
    }

    /// Compute the waveform off the downloaded recording (cached after the
    /// first visit, so this is usually instant).
    private func loadWaveform() {
        guard waveSamples == nil else { return }
        Task {
            guard let url = try? await store.localAudioFile(for: full) else { return }
            waveSamples = await WaveformLoader.samples(from: url)
        }
    }

    // MARK: download

    private var downloadButton: some View {
        Button(action: download) {
            HStack(spacing: 6) {
                if preparingShare {
                    ProgressView().controlSize(.small).tint(MemoTheme.sub)
                } else {
                    Image(systemName: "square.and.arrow.down").font(.system(size: 14, weight: .semibold))
                }
                Text(preparingShare ? "Preparing…" : "Download recording")
                    .font(.system(size: 14, weight: .semibold))
            }
            .foregroundColor(MemoTheme.sub)
            .padding(.horizontal, 14).padding(.vertical, 9)
            .background(RoundedRectangle(cornerRadius: 8).fill(Color.white))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(MemoTheme.line))
        }
        .buttonStyle(.plain)
        .disabled(preparingShare)
        .accessibilityLabel("Download this recording")
    }

    /// Fetch the audio (cache-first) and hand it to the share sheet, named
    /// after the memo — save to Files, AirDrop, wherever.
    private func download() {
        guard !preparingShare else { return }
        preparingShare = true
        audioError = nil
        Task {
            do { shareItem = SharedFile(url: try await store.shareFile(for: full)) }
            catch { audioError = "Couldn’t download this recording." }
            preparingShare = false
        }
    }

    private var sendToBlock: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Send to").font(.system(size: 13, weight: .bold)).foregroundColor(MemoTheme.sub)
            HStack(spacing: 10) {
                Image(systemName: "film").font(.system(size: 16)).foregroundColor(MemoTheme.sub)
                VStack(alignment: .leading, spacing: 1) {
                    Text("A Deck Factory movie").font(.system(size: 15, weight: .semibold)).foregroundColor(MemoTheme.ink)
                    Text("Coming soon").font(.system(size: 12)).foregroundColor(MemoTheme.sub)
                }
                Spacer()
            }
            .padding(12)
            .background(RoundedRectangle(cornerRadius: 8).fill(Color.white))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(MemoTheme.line))
            .opacity(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func commitName() {
        let n = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard n != store.name(for: entry) else { return }
        store.setPref(id: entry.id, name: n)
    }

    private func toggleChip(on: Bool, onIcon: String, offIcon: String, label: String,
                            onColor: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: on ? onIcon : offIcon).font(.system(size: 14, weight: .semibold))
                Text(label).font(.system(size: 14, weight: .semibold))
            }
            .foregroundColor(on ? .white : MemoTheme.sub)
            .padding(.horizontal, 14).padding(.vertical, 9)
            .background(RoundedRectangle(cornerRadius: 8).fill(on ? onColor : Color.white))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(on ? .clear : MemoTheme.line))
        }.buttonStyle(.plain)
    }

    private var playButton: some View {
        Button { play() } label: {
            ZStack {
                RoundedRectangle(cornerRadius: 14, style: .continuous).fill(tint).frame(width: 60, height: 60)
                if loading { ProgressView().tint(.white) }
                else {
                    Image(systemName: (isThis && player.isPlaying) ? "pause.fill" : "play.fill")
                        .font(.system(size: 22, weight: .bold)).foregroundColor(.white)
                        .offset(x: (isThis && player.isPlaying) ? 0 : 2)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(isThis && player.isPlaying ? "Pause" : "Play")
    }

    private func play(startingAt seconds: Double? = nil) {
        if isThis, seconds == nil { player.togglePause(); return }
        guard !full.file.isEmpty else { audioError = "Couldn’t find this recording."; return }
        loading = true; audioError = nil
        Task {
            do {
                // Prefer the downloaded copy (the waveform loader fetched it);
                // fall back to streaming from Storage.
                let url = store.cachedAudioFile(for: full)
                    ?? (try await store.audioURL(file: full.file))
                player.play(full, url: url)
                if let s = seconds { player.seek(to: s) }
            } catch { audioError = "Couldn’t play this recording." }
            loading = false
        }
    }
}
