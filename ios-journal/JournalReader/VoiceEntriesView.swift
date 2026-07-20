import SwiftUI

/// The voice memos slotted into the journal by date: dreams (lilac) and spoken
/// journal entries (tan) from 2024 on. Tap a row to read its transcript; tap the
/// disc to play the recording — the source, in place of a scanned page.
struct VoiceEntriesView: View {
    @StateObject private var store = VoiceEntriesStore()
    @StateObject private var player = VoicePlayer()
    @State private var filter: Filter = .all

    enum Filter: String, CaseIterable, Identifiable {
        case all = "All", dreams = "Dreams", journals = "Journals"
        var id: String { rawValue }
    }

    private static let paper = Color(red: 0.988, green: 0.973, blue: 0.953)

    var body: some View {
        VStack(spacing: 0) {
            Picker("Kind", selection: $filter) {
                ForEach(Filter.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)

            content
        }
        .background(Self.paper.ignoresSafeArea())
        .onAppear { store.loadIfNeeded() }
    }

    @ViewBuilder
    private var content: some View {
        switch store.phase {
        case .idle, .loading:
            centered { ProgressView("Loading your voice memos…").tint(.gray) }
        case .failed(let message):
            centered {
                VStack(spacing: 12) {
                    Image(systemName: "wifi.exclamationmark").font(.system(size: 34)).foregroundStyle(.gray)
                    Text("Couldn’t load your memos").font(.headline)
                    Text(message).font(.footnote).foregroundColor(.secondary).multilineTextAlignment(.center)
                    Button("Try again") { store.load() }.buttonStyle(.bordered)
                }
                .padding(32)
            }
        case .ready:
            if sections.isEmpty {
                centered { Text("No voice memos here yet.").foregroundColor(.secondary) }
            } else {
                list
            }
        }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0, pinnedViews: [.sectionHeaders]) {
                ForEach(sections, id: \.0) { section in
                    Section {
                        ForEach(section.1) { entry in
                            VoiceRow(entry: entry, store: store, player: player)
                            Divider().padding(.leading, 62)
                        }
                    } header: {
                        Text(section.0)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(Color(white: 0.40))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 16).padding(.vertical, 6)
                            .background(Self.paper.opacity(0.98))
                    }
                }
            }
            .padding(.bottom, 24)
        }
    }

    private func centered<V: View>(@ViewBuilder _ inner: () -> V) -> some View {
        VStack { Spacer(); inner(); Spacer() }.frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: filtering + grouping

    private var filtered: [VoiceEntry] {
        store.entries.filter {
            switch filter {
            case .all: return true
            case .dreams: return $0.cat == "dream"
            case .journals: return $0.cat == "journal"
            }
        }
    }

    /// Entries grouped into "Month Year" sections, newest first.
    private var sections: [(String, [VoiceEntry])] {
        var order: [String] = []
        var map: [String: [VoiceEntry]] = [:]
        for e in filtered {
            let key = VoiceDate.monthYear(e.date)
            if map[key] == nil { map[key] = []; order.append(key) }
            map[key]?.append(e)
        }
        return order.map { ($0, map[$0] ?? []) }
    }
}

/// One memo: category disc/play button, title, date, and a tap-to-expand
/// transcript. The recording streams from Firebase on first play.
private struct VoiceRow: View {
    let entry: VoiceEntry
    @ObservedObject var store: VoiceEntriesStore
    @ObservedObject var player: VoicePlayer

    @State private var expanded = false
    @State private var loading = false
    @State private var audioError: String?

    private var isThis: Bool { player.currentID == entry.id }
    private var tint: Color {
        entry.cat == "dream"
            ? Color(red: 0.79, green: 0.71, blue: 0.98)   // lilac
            : Color(red: 0.86, green: 0.75, blue: 0.55)   // tan (journal / "day")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 12) {
                playButton
                VStack(alignment: .leading, spacing: 3) {
                    Text(entry.title ?? "Untitled")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.black)
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 8) {
                        Text(entry.cat == "dream" ? "Dream" : "Journal")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 8).padding(.vertical, 2)
                            .background(RoundedRectangle(cornerRadius: 5, style: .continuous).fill(tint))
                        Text(VoiceDate.pretty(entry.date))
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(Color(white: 0.32))
                        if let dur = entry.dur {
                            Text(VoiceDate.duration(dur))
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(Color(white: 0.32))
                        }
                    }
                }
                Spacer(minLength: 0)
                Image(systemName: expanded ? "chevron.up" : "chevron.down")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.gray.opacity(0.6))
                    .padding(.top, 4)
            }

            if expanded {
                if let t = entry.transcript, !t.isEmpty {
                    Text(t)
                        .font(.system(size: 15))
                        .foregroundColor(.black.opacity(0.85))
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.leading, 50)
                } else {
                    Text("No transcript.")
                        .font(.system(size: 14)).foregroundColor(.secondary)
                        .padding(.leading, 50)
                }
            } else if let d = entry.desc, !d.isEmpty {
                Text(d)
                    .font(.system(size: 14))
                    .foregroundColor(Color(white: 0.28))
                    .lineLimit(2)
                    .padding(.leading, 50)
            }

            if let audioError {
                Text(audioError)
                    .font(.system(size: 12)).foregroundColor(.red)
                    .padding(.leading, 50)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .contentShape(Rectangle())
        .onTapGesture { withAnimation(.easeInOut(duration: 0.18)) { expanded.toggle() } }
    }

    private var playButton: some View {
        Button(action: play) {
            ZStack {
                Circle().fill(tint).frame(width: 38, height: 38)
                if loading {
                    ProgressView().tint(.white)
                } else {
                    Image(systemName: (isThis && player.isPlaying) ? "pause.fill" : "play.fill")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(.white)
                        .offset(x: (isThis && player.isPlaying) ? 0 : 1)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(isThis && player.isPlaying ? "Pause" : "Play")
    }

    private func play() {
        if isThis { player.togglePause(); return }
        loading = true
        audioError = nil
        Task {
            do {
                let url = try await store.audioURL(for: entry)
                player.play(entry, url: url)
            } catch {
                audioError = "Couldn’t play this recording."
            }
            loading = false
        }
    }
}

/// Small date helpers for the voice list (POSIX parsing so it's locale-stable).
enum VoiceDate {
    private static let parser: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private static func format(_ iso: String?, _ pattern: String) -> String? {
        guard let iso, let d = parser.date(from: iso) else { return nil }
        let out = DateFormatter()
        out.locale = Locale(identifier: "en_US")
        out.dateFormat = pattern
        return out.string(from: d)
    }

    static func pretty(_ iso: String?) -> String { format(iso, "EEE, MMM d, yyyy") ?? (iso ?? "Undated") }
    static func monthYear(_ iso: String?) -> String { format(iso, "MMMM yyyy") ?? "Undated" }

    static func duration(_ seconds: Int) -> String {
        let m = seconds / 60, s = seconds % 60
        return String(format: "%d:%02d", m, s)
    }
}
