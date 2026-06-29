import SwiftUI

/// The XI archive: every memory you've written, as a searchable, filterable grid
/// of cards — mirrors the web Archive (search, hashtag filters, mode filter).
struct LibraryView: View {
    @Environment(\.dismiss) private var dismiss

    @State private var memories: [XIMemory] = []
    @State private var loading = true

    @State private var search = ""
    @State private var activeTags: Set<String> = []
    @State private var mode: ModeFilter = .all
    @State private var detail: XIMemory?
    @State private var showConstellation = false

    enum ModeFilter: String, CaseIterable, Identifiable {
        case all = "All", board = "Board", versus = "Versus"
        var id: String { rawValue }
    }

    private let cols = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]

    // MARK: filtering

    private var filtered: [XIMemory] {
        let q = search.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return memories.filter { m in
            if mode == .board && m.mode != "board" { return false }
            if mode == .versus && m.mode != "versus" { return false }
            if !activeTags.isEmpty && !activeTags.isSubset(of: Set(m.hashtags)) { return false }
            if !q.isEmpty {
                let hay = (m.title + " " + m.content + " " + m.hashtags.joined(separator: " ")).lowercased()
                if !hay.contains(q) { return false }
            }
            return true
        }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                searchBar
                if !activeTags.isEmpty { activeTagBar }
                content
            }
            .background(XITheme.paper.ignoresSafeArea())
            .navigationTitle("your memories")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showConstellation = true } label: { Image(systemName: "sparkles") }
                        .tint(XITheme.maroon)
                        .disabled(memories.isEmpty)
                }
            }
            .sheet(item: $detail) { m in MemoryDetailSheet(memory: m) }
            .sheet(isPresented: $showConstellation) {
                ConstellationView(memories: memories)
            }
        }
        .task {
            memories = await XIService.shared.allXiMemories()
            loading = false
        }
    }

    // MARK: bars

    private var searchBar: some View {
        VStack(spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(XITheme.line)
                TextField("search memories", text: $search)
                    .font(.system(.body, design: .serif)).foregroundStyle(XITheme.ink)
                    .autocorrectionDisabled()
                if !search.isEmpty {
                    Button { search = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(XITheme.line) }
                }
            }
            .padding(10)
            .background(XITheme.white)
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(XITheme.line.opacity(0.6)))
            .clipShape(RoundedRectangle(cornerRadius: 8))

            Picker("Mode", selection: $mode) {
                ForEach(ModeFilter.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
        }
        .padding(.horizontal, 14).padding(.top, 8).padding(.bottom, 10)
    }

    private var activeTagBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Array(activeTags).sorted(), id: \.self) { tag in
                    Button { activeTags.remove(tag) } label: {
                        HStack(spacing: 4) {
                            Text(tag).font(.system(.caption, design: .serif))
                            Image(systemName: "xmark").font(.system(size: 9, weight: .bold))
                        }
                        .foregroundStyle(.white)
                        .padding(.vertical, 5).padding(.horizontal, 10)
                        .background(XITheme.maroon)
                        .clipShape(Capsule())
                    }
                }
                Button("clear") { activeTags.removeAll() }
                    .font(.system(.caption, design: .serif)).tint(XITheme.maroon)
            }
            .padding(.horizontal, 14)
        }
        .padding(.bottom, 8)
    }

    // MARK: content

    @ViewBuilder
    private var content: some View {
        if loading {
            Spacer(); ProgressView().tint(XITheme.maroon); Spacer()
        } else if memories.isEmpty {
            emptyState("No memories yet.", "Tap two touching cards on the board to write one.")
        } else if filtered.isEmpty {
            emptyState("No matches.", "Try a different search or clear your filters.")
        } else {
            ScrollView {
                LazyVGrid(columns: cols, alignment: .leading, spacing: 12) {
                    ForEach(filtered) { m in
                        MemoryCard(memory: m, activeTags: activeTags,
                                   onOpen: { detail = m },
                                   onTag: { tag in toggle(tag) })
                    }
                }
                .padding(14)
            }
        }
    }

    private func emptyState(_ title: String, _ subtitle: String) -> some View {
        VStack(spacing: 8) {
            Spacer()
            Text(title).font(.system(.title3, design: .serif)).foregroundStyle(XITheme.ink)
            Text(subtitle).font(.system(.body, design: .serif)).foregroundStyle(XITheme.line)
                .multilineTextAlignment(.center)
            Spacer()
        }
        .padding(24).frame(maxWidth: .infinity)
    }

    private func toggle(_ tag: String) {
        if activeTags.contains(tag) { activeTags.remove(tag) } else { activeTags.insert(tag) }
    }
}

// MARK: - Memory card

private struct MemoryCard: View {
    let memory: XIMemory
    let activeTags: Set<String>
    var onOpen: () -> Void
    var onTag: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !memory.title.isEmpty {
                Text(memory.title)
                    .font(.system(.subheadline, design: .serif).weight(.medium))
                    .foregroundStyle(XITheme.archiveTitle)
                    .lineLimit(3)
            }
            Text(memory.content)
                .font(.system(.footnote, design: .serif))
                .foregroundStyle(XITheme.archiveBody)
                .lineLimit(9)
                .fixedSize(horizontal: false, vertical: true)
            if !memory.hashtags.isEmpty {
                FlowTags(tags: Array(memory.hashtags.prefix(3)), active: activeTags, onTag: onTag)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(XITheme.archiveCard)
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(XITheme.archiveBorder))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .contentShape(Rectangle())
        .onTapGesture { onOpen() }
    }
}

/// Simple wrapping row of tappable hashtag chips.
private struct FlowTags: View {
    let tags: [String]
    let active: Set<String>
    var onTag: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(tags, id: \.self) { tag in
                Button { onTag(tag) } label: {
                    Text(tag)
                        .font(.system(size: 11, design: .serif))
                        .foregroundStyle(XITheme.maroon)
                        .padding(.vertical, 3).padding(.horizontal, 8)
                        .background(XITheme.maroon.opacity(active.contains(tag) ? 0.22 : 0.08))
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
    }
}

// MARK: - Detail

struct MemoryDetailSheet: View {
    @Environment(\.dismiss) private var dismiss
    let memory: XIMemory

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if !memory.title.isEmpty {
                        Text(memory.title)
                            .font(.system(.title3, design: .serif).weight(.semibold))
                            .foregroundStyle(XITheme.archiveTitle)
                    }
                    Text(memory.content)
                        .font(.system(.body, design: .serif))
                        .foregroundStyle(XITheme.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    if !memory.hashtags.isEmpty {
                        HStack {
                            ForEach(memory.hashtags, id: \.self) { tag in
                                Text(tag).font(.system(size: 12, design: .serif)).foregroundStyle(XITheme.maroon)
                                    .padding(.vertical, 3).padding(.horizontal, 8)
                                    .background(XITheme.maroon.opacity(0.08)).clipShape(Capsule())
                            }
                        }
                    }
                    if !memory.dateTime.isEmpty {
                        Text(memory.dateTime).font(.system(.caption, design: .serif)).foregroundStyle(XITheme.line)
                    }
                    Spacer()
                }
                .padding(20).frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(XITheme.paper.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("done") { dismiss() }.font(.system(.body, design: .serif)).tint(XITheme.maroon)
                }
            }
        }
    }
}
