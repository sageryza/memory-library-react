import SwiftUI
import AVFoundation
import FirebaseAuth
import FirebaseFunctions
import FirebaseStorage

/// One hit from the `searchArchive` Cloud Function. A hit is either a voice memo
/// (playable) or a journal entry (text). Only the fields the function returns are
/// present — memos carry `cat`, journal entries carry `type`.
struct ArchiveHit: Identifiable {
    let source: String        // "memo" | "journal"
    let id: String
    let file: String?         // memos: audio file under memo-audio/
    let dur: Int?             // memos: seconds
    let date: String?
    let title: String?
    let cat: String?          // memos: "dream" | "journal"
    let type: String?         // journal entries: band type
    let snippet: String?
    let score: Double
}

/// Backs the archive search: which source (memos / journal / both), the query,
/// the hits, and a memo lookup so a memo hit can stream its recording. All of
/// Sage's voice memos + journal entries were embedded once (server-side) into
/// `search-index/archive.json`; this calls the `searchArchive` callable which
/// ranks that index by meaning against the query.
@MainActor
final class ArchiveSearchStore: ObservableObject {
    enum Source: String, CaseIterable, Identifiable {
        case both = "both", memo = "memo", journal = "journal"
        var id: String { rawValue }
        var label: String { self == .both ? "Both" : (self == .memo ? "Memos" : "Journal") }
    }
    enum Phase: Equatable { case idle, searching, ready, failed(String) }

    @Published var source: Source = .both
    @Published var query = ""
    @Published var phase: Phase = .idle
    @Published var hits: [ArchiveHit] = []

    private lazy var functions = Functions.functions()
    private let storage = Storage.storage()

    func search() {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty else { hits = []; phase = .idle; return }
        phase = .searching
        Task {
            do {
                try await ensureAuth()
                let res = try await functions.httpsCallable("searchArchive").call([
                    "query": q, "source": source.rawValue, "limit": 40,
                ])
                let raw = (res.data as? [String: Any])?["results"] as? [[String: Any]] ?? []
                hits = raw.map { d in
                    ArchiveHit(
                        source: (d["source"] as? String) ?? "memo",
                        id: (d["id"] as? String) ?? UUID().uuidString,
                        file: d["file"] as? String,
                        dur: d["dur"] as? Int,
                        date: d["date"] as? String,
                        title: d["title"] as? String,
                        cat: d["cat"] as? String,
                        type: d["type"] as? String,
                        snippet: d["snippet"] as? String,
                        score: (d["score"] as? Double) ?? 0
                    )
                }
                phase = .ready
            } catch {
                phase = .failed(error.localizedDescription)
            }
        }
    }

    /// A playable download URL for a memo hit, streamed straight from the file
    /// carried on the hit (`memo-audio/<file>`). No manifest lookup.
    func audioURL(file: String) async throws -> URL {
        try await ensureAuth()
        return try await storage.reference(withPath: "memo-audio/\(file)").downloadURL()
    }

    private func ensureAuth() async throws {
        if Auth.auth().currentUser == nil { try await Auth.auth().signInAnonymously() }
    }
}

/// Semantic search across Sage's archive — her voice memos and her journal
/// entries — ranked by meaning, not keywords. A toggle chooses memos, journal,
/// or both. Memo hits play the recording in place; journal hits show the passage.
struct ArchiveSearchView: View {
    /// Called when a journal hit is tapped, with its timeline page to focus.
    var onSelectJournal: (Int) -> Void = { _ in }

    @StateObject private var store = ArchiveSearchStore()
    @StateObject private var player = VoicePlayer()
    @FocusState private var searching: Bool

    private static let paper = Color(red: 0.988, green: 0.973, blue: 0.953)

    var body: some View {
        VStack(spacing: 0) {
            searchField
            Picker("Source", selection: $store.source) {
                ForEach(ArchiveSearchStore.Source.allCases) { Text($0.label).tag($0) }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 12)
            .padding(.bottom, 8)
            .onChange(of: store.source) { _, _ in if !store.query.isEmpty { store.search() } }

            content
        }
        .background(Self.paper.ignoresSafeArea())
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundColor(.gray)
            TextField("Search by meaning…", text: $store.query)
                .focused($searching)
                .submitLabel(.search)
                .onSubmit { store.search() }
                .autocorrectionDisabled()
            if !store.query.isEmpty {
                Button {
                    store.query = ""; store.hits = []; store.phase = .idle
                } label: {
                    Image(systemName: "xmark.circle.fill").foregroundColor(.gray.opacity(0.6))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: 6).fill(Color.white))
        .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color.gray.opacity(0.25)))
        .padding(.horizontal, 12).padding(.top, 10).padding(.bottom, 8)
    }

    @ViewBuilder
    private var content: some View {
        switch store.phase {
        case .idle:
            centered {
                VStack(spacing: 8) {
                    Image(systemName: "sparkle.magnifyingglass").font(.system(size: 34)).foregroundStyle(.gray.opacity(0.5))
                    Text("Search your memos and journal by meaning.")
                        .font(.footnote).foregroundColor(.secondary).multilineTextAlignment(.center)
                }.padding(32)
            }
        case .searching:
            centered { ProgressView("Searching…").tint(.gray) }
        case .failed(let message):
            centered {
                VStack(spacing: 12) {
                    Image(systemName: "wifi.exclamationmark").font(.system(size: 34)).foregroundStyle(.gray)
                    Text("Couldn’t search").font(.headline)
                    Text(message).font(.footnote).foregroundColor(.secondary).multilineTextAlignment(.center)
                    Button("Try again") { store.search() }.buttonStyle(.bordered)
                }.padding(32)
            }
        case .ready:
            if store.hits.isEmpty {
                centered { Text("Nothing found.").foregroundColor(.secondary) }
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(store.hits) { hit in
                            ArchiveHitRow(hit: hit, store: store, player: player,
                                          onSelectJournal: onSelectJournal)
                            Divider().padding(.leading, 16)
                        }
                    }
                    .padding(.bottom, 24)
                }
            }
        }
    }

    private func centered<V: View>(@ViewBuilder _ inner: () -> V) -> some View {
        VStack { Spacer(); inner(); Spacer() }.frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// One search hit. Memo hits get a play disc (tint by dream/journal) and stream
/// the recording; journal hits show the passage with a small band-type tag.
private struct ArchiveHitRow: View {
    let hit: ArchiveHit
    @ObservedObject var store: ArchiveSearchStore
    @ObservedObject var player: VoicePlayer
    var onSelectJournal: (Int) -> Void = { _ in }

    @State private var loading = false
    @State private var audioError: String?

    private var isMemo: Bool { hit.source == "memo" }
    /// Journal ids look like "p12-3" → timeline page 12.
    private var journalPage: Int? {
        guard hit.source == "journal", hit.id.hasPrefix("p") else { return nil }
        return Int(hit.id.dropFirst().prefix { $0 != "-" })
    }
    private var isThis: Bool { player.currentID == hit.id }
    private var tint: Color {
        if isMemo {
            return hit.cat == "dream"
                ? Color(red: 0.79, green: 0.71, blue: 0.98)   // lilac
                : Color(red: 0.86, green: 0.75, blue: 0.55)   // tan
        }
        return Color(red: 0.60, green: 0.66, blue: 0.55)      // sage-green for journal text
    }
    private var kindLabel: String {
        if isMemo { return hit.cat == "dream" ? "Dream" : "Journal" }
        return (hit.type ?? "entry").capitalized
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            if isMemo { playButton } else { journalGlyph }

            VStack(alignment: .leading, spacing: 4) {
                if let title = hit.title, !title.isEmpty {
                    Text(title)
                        .font(.system(size: 16, weight: .semibold)).foregroundColor(.black)
                        .fixedSize(horizontal: false, vertical: true)
                }
                HStack(spacing: 8) {
                    Text(kindLabel)
                        .font(.system(size: 11, weight: .semibold)).foregroundColor(.white)
                        .padding(.horizontal, 8).padding(.vertical, 2)
                        .background(RoundedRectangle(cornerRadius: 5, style: .continuous).fill(tint))
                    Text(VoiceDate.pretty(hit.date))
                        .font(.system(size: 12, weight: .medium)).foregroundColor(Color(white: 0.32))
                }
                if let s = hit.snippet, !s.isEmpty {
                    Text(s)
                        .font(.system(size: 14)).foregroundColor(Color(white: 0.28))
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let audioError {
                    Text(audioError).font(.system(size: 12)).foregroundColor(.red)
                }
            }
            Spacer(minLength: 0)
            if journalPage != nil {
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.gray.opacity(0.5))
                    .padding(.top, 4)
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
        .contentShape(Rectangle())
        .onTapGesture { if let p = journalPage { onSelectJournal(p) } }
    }

    private var playButton: some View {
        Button(action: play) {
            ZStack {
                Circle().fill(tint).frame(width: 38, height: 38)
                if loading {
                    ProgressView().tint(.white)
                } else {
                    Image(systemName: (isThis && player.isPlaying) ? "pause.fill" : "play.fill")
                        .font(.system(size: 15, weight: .bold)).foregroundColor(.white)
                        .offset(x: (isThis && player.isPlaying) ? 0 : 1)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(isThis && player.isPlaying ? "Pause" : "Play")
    }

    private var journalGlyph: some View {
        ZStack {
            Circle().fill(tint.opacity(0.18)).frame(width: 38, height: 38)
            Image(systemName: "text.alignleft").font(.system(size: 15, weight: .semibold)).foregroundColor(tint)
        }
    }

    private func play() {
        if isThis { player.togglePause(); return }
        guard let file = hit.file else {
            audioError = "Couldn’t find this recording."; return
        }
        loading = true; audioError = nil
        let entry = VoiceEntry(id: hit.id, file: file, date: hit.date,
                               cat: hit.cat ?? "journal", title: hit.title,
                               desc: nil, transcript: nil, dur: hit.dur)
        Task {
            do {
                let url = try await store.audioURL(file: file)
                player.play(entry, url: url)
            } catch {
                audioError = "Couldn’t play this recording."
            }
            loading = false
        }
    }
}
