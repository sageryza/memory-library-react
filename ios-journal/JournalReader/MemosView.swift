import SwiftUI
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

/// Backs the Memos tab: the full memo list (newest first, for browsing + keyword
/// filtering) plus semantic search over the archive.
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

    @Published var listLoad: Load = .idle
    @Published var memos: [VoiceEntry] = []   // all, newest first (browse + keyword)

    @Published var searching = false
    @Published var searchError: String?
    @Published var hits: [ArchiveHit] = []

    private lazy var functions = Functions.functions()
    private let storage = Storage.storage()

    // MARK: browse list (manifest)

    func loadIfNeeded() {
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
                // Everything with real content, newest first. Skip the silent/empty
                // recordings so browsing isn't full of blanks.
                memos = all
                    .filter { $0.cat != "empty" && ($0.date ?? "").isEmpty == false }
                    .sorted { ($0.date ?? "") > ($1.date ?? "") }
                listLoad = .ready
            } catch {
                listLoad = .failed(error.localizedDescription)
            }
        }
    }

    /// Keyword (plain text) filter over the loaded memos.
    var keywordResults: [VoiceEntry] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return memos }
        return memos.filter {
            ($0.title?.lowercased().contains(q) ?? false)
            || ($0.transcript?.lowercased().contains(q) ?? false)
            || ($0.desc?.lowercased().contains(q) ?? false)
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

    func audioURL(file: String) async throws -> URL {
        try await ensureAuth()
        return try await storage.reference(withPath: "memo-audio/\(file)").downloadURL()
    }

    private func ensureAuth() async throws {
        if Auth.auth().currentUser == nil { try await Auth.auth().signInAnonymously() }
    }
}

/// The Voice Memos tab: browse your recordings newest-first, filter them by text,
/// or flip on ✨ to search by meaning (across memos and/or your journal).
struct MemosView: View {
    @EnvironmentObject private var router: AppRouter
    @StateObject private var store = MemosStore()
    @StateObject private var player = VoicePlayer()
    @FocusState private var focused: Bool

    var body: some View {
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
        .onAppear { store.loadIfNeeded() }
        .onChange(of: store.semantic) { _, on in if on { store.runSemantic() } else { store.hits = [] } }
    }

    private var header: some View {
        HStack {
            Text("Voice Memos")
                .font(.system(size: 22, weight: .bold)).foregroundColor(MemoTheme.ink)
            Spacer()
        }
        .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 4)
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundColor(MemoTheme.sub)
            TextField(store.semantic ? "Search by meaning…" : "Search your memos…", text: $store.query)
                .focused($focused)
                .foregroundColor(MemoTheme.ink)
                .submitLabel(.search)
                .autocorrectionDisabled()
                .onSubmit { if store.semantic { store.runSemantic() } }
            if !store.query.isEmpty {
                Button { store.query = ""; store.hits = [] } label: {
                    Image(systemName: "xmark.circle.fill").foregroundColor(MemoTheme.sub.opacity(0.7))
                }.buttonStyle(.plain)
            }
            // ✨ meaning toggle (XI-style): filled rose when ON.
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

    @ViewBuilder
    private var content: some View {
        let hasQuery = !store.query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        if store.semantic && hasQuery {
            semanticResults
        } else {
            browseList   // empty query, or keyword mode → the memo list (filtered live)
        }
    }

    // Browse (empty query) or keyword-filtered memo list.
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
            let items = store.keywordResults
            if items.isEmpty {
                centered { Text("No memos match.").foregroundColor(MemoTheme.sub) }
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(items) { entry in
                            MemoRow(entry: entry, store: store, player: player)
                            Divider().overlay(MemoTheme.line).padding(.leading, 66)
                        }
                    }.padding(.bottom, 24)
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
                            MemoRow(entry: hit.asEntry, store: store, player: player, snippet: hit.snippet)
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

/// One memo: colored play disc, title, category chip, date, and a tap-to-expand
/// transcript. Colors are deep enough to read on the cream background.
private struct MemoRow: View {
    let entry: VoiceEntry
    @ObservedObject var store: MemosStore
    @ObservedObject var player: VoicePlayer
    var snippet: String? = nil

    @State private var expanded = false
    @State private var loading = false
    @State private var audioError: String?

    private var isThis: Bool { player.currentID == entry.id }
    private var tint: Color { entry.cat == "dream" ? MemoTheme.dream : MemoTheme.memo }
    private var chip: String {
        switch entry.cat {
        case "dream": return "Dream"
        case "journal": return "Journal"
        default: return (entry.cat).capitalized
        }
    }
    private var body2: String? { snippet ?? entry.desc }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 12) {
                playButton
                VStack(alignment: .leading, spacing: 4) {
                    Text(entry.title ?? "Untitled")
                        .font(.system(size: 16, weight: .semibold)).foregroundColor(MemoTheme.ink)
                        .fixedSize(horizontal: false, vertical: true)
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
                    if let b = body2, !b.isEmpty, !expanded {
                        Text(b).font(.system(size: 14)).foregroundColor(MemoTheme.sub)
                            .lineLimit(2).fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer(minLength: 0)
                if entry.transcript?.isEmpty == false {
                    Image(systemName: expanded ? "chevron.up" : "chevron.down")
                        .font(.system(size: 12, weight: .semibold)).foregroundColor(MemoTheme.sub.opacity(0.7))
                        .padding(.top, 4)
                }
            }
            if expanded, let t = entry.transcript, !t.isEmpty {
                Text(t).font(.system(size: 15)).foregroundColor(MemoTheme.ink.opacity(0.9))
                    .fixedSize(horizontal: false, vertical: true).padding(.leading, 54)
            }
            if let audioError {
                Text(audioError).font(.system(size: 12)).foregroundColor(.red).padding(.leading, 54)
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
        .contentShape(Rectangle())
        .onTapGesture {
            if entry.transcript?.isEmpty == false { withAnimation(.easeInOut(duration: 0.18)) { expanded.toggle() } }
        }
    }

    private var playButton: some View {
        Button(action: play) {
            ZStack {
                Circle().fill(tint).frame(width: 40, height: 40)
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
                Circle().fill(MemoTheme.entry.opacity(0.20)).frame(width: 40, height: 40)
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
