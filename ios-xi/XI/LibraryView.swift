import SwiftUI

/// The XI archive — every memory you've written, mirroring the web Archive:
/// text search, boolean hashtag filtering, advanced AND/OR/NOT search, smart &
/// manual Libraries (incl. locked), simplify view, sort, and bulk select-edit.
struct LibraryView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var store = ArchiveStore()

    @State private var detail: XIMemory?
    @State private var showConstellation = false
    @State private var showFilter = false
    @State private var showLibraries = false
    @State private var showAddTag = false
    @State private var addTagText = ""
    @FocusState private var searchFocused: Bool

    private let gridCols = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]
    private let simplifyCols = [GridItem(.flexible(), spacing: 10),
                                GridItem(.flexible(), spacing: 10),
                                GridItem(.flexible(), spacing: 10)]

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                searchBar
                if !store.tagFilters.isEmpty || store.selectedLibrary != nil { activeBar }
                content
                if store.selectMode { selectionBar }
            }
            .background(XITheme.paper.ignoresSafeArea())
            .navigationTitle(store.selectedLibrary?.name ?? "your memories")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { toolbarContent }
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { searchFocused = false }
                        .font(.system(.body, design: .serif)).tint(XITheme.gold)
                }
            }
            .sheet(item: $detail) { m in MemoryDetailSheet(memory: m) }
            .sheet(isPresented: $showConstellation) { ConstellationView(memories: store.memories) }
            .sheet(isPresented: $showFilter) { ArchiveFilterSheet(store: store) }
            .sheet(isPresented: $showLibraries) { ArchiveLibrariesSheet(store: store) }
            .alert("Add hashtag", isPresented: $showAddTag) {
                TextField("#tag", text: $addTagText)
                Button("Cancel", role: .cancel) {}
                Button("Add") {
                    let t = addTagText; addTagText = ""
                    Task { await store.bulkAddTag(t) }
                }
            } message: { Text("Adds to the \(store.selectedIds.count) selected memories.") }
        }
        .task { await store.load() }
    }

    // MARK: toolbar

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Button { showLibraries = true } label: { Image(systemName: "books.vertical") }.tint(XITheme.gold)
        }
        ToolbarItem(placement: .topBarTrailing) {
            Button { showFilter = true } label: {
                Image(systemName: "line.3.horizontal.decrease.circle")
                    .overlay(alignment: .topTrailing) {
                        if store.activeFilterCount > 0 {
                            Text("\(store.activeFilterCount)")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundStyle(.white)
                                .frame(width: 14, height: 14)
                                .background(XITheme.maroon).clipShape(Circle())
                                .offset(x: 6, y: -6)
                        }
                    }
            }.tint(XITheme.gold)
        }
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                Button { store.simplify.toggle() } label: {
                    Label(store.simplify ? "Detailed view" : "Simplify view",
                          systemImage: store.simplify ? "rectangle.grid.1x2" : "square.grid.3x3")
                }
                Button { store.toggleSelectMode() } label: {
                    Label(store.selectMode ? "Done selecting" : "Select", systemImage: "checkmark.circle")
                }
                Button { showConstellation = true } label: { Label("Constellation", systemImage: "sparkles") }
                    .disabled(store.memories.isEmpty)
            } label: { Image(systemName: "ellipsis.circle") }.tint(XITheme.gold)
        }
    }

    // MARK: bars

    private var searchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundStyle(XITheme.line)
            TextField("search memories", text: $store.search)
                .font(.system(.body, design: .serif)).foregroundStyle(XITheme.ink)
                .autocorrectionDisabled()
                .focused($searchFocused)
                .submitLabel(.search)
                .onSubmit { searchFocused = false }
            if !store.search.isEmpty {
                Button { store.search = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(XITheme.line) }
            }
        }
        .padding(10)
        .background(XITheme.white)
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(XITheme.line.opacity(0.6)))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .padding(.horizontal, 14).padding(.top, 8).padding(.bottom, 10)
    }

    private var activeBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                if let lib = store.selectedLibrary {
                    HStack(spacing: 4) {
                        Image(systemName: "books.vertical.fill").font(.system(size: 9))
                        Text(lib.name).font(.system(.caption, design: .serif))
                        Image(systemName: "xmark").font(.system(size: 9, weight: .bold))
                    }
                    .foregroundStyle(.white).padding(.vertical, 5).padding(.horizontal, 10)
                    .background(XITheme.gold).clipShape(Capsule())
                    .onTapGesture { store.selectLibrary(nil) }
                }
                ForEach(Array(store.tagFilters.enumerated()), id: \.element.id) { idx, f in
                    HStack(spacing: 5) {
                        if idx > 0 {
                            Button { store.flipOp(f.id) } label: {
                                Text(f.op.rawValue).font(.system(size: 9, weight: .bold, design: .monospaced))
                                    .foregroundStyle(XITheme.maroon)
                            }.buttonStyle(.plain)
                        }
                        Button { store.removeTag(f.id) } label: {
                            HStack(spacing: 4) {
                                Text(f.tag).font(.system(.caption, design: .serif))
                                Image(systemName: "xmark").font(.system(size: 9, weight: .bold))
                            }
                            .foregroundStyle(.white).padding(.vertical, 5).padding(.horizontal, 10)
                            .background(XITheme.maroon).clipShape(Capsule())
                        }.buttonStyle(.plain)
                    }
                }
            }
            .padding(.horizontal, 14)
        }
        .padding(.bottom, 8)
    }

    private var selectionBar: some View {
        HStack(spacing: 14) {
            Text("\(store.selectedIds.count) selected")
                .font(.system(.footnote, design: .serif)).foregroundStyle(XITheme.ink)
            Spacer()
            Menu {
                Button { showAddTag = true } label: { Label("Add hashtag", systemImage: "tag") }
                if !store.tagsInSelection.isEmpty {
                    Menu {
                        ForEach(store.tagsInSelection, id: \.self) { t in
                            Button(t) { Task { await store.bulkRemoveTag(t) } }
                        }
                    } label: { Label("Remove hashtag", systemImage: "tag.slash") }
                }
                if !store.libraries.isEmpty {
                    Menu {
                        ForEach(store.libraries) { lib in
                            Button(lib.name) { Task { await store.addSelectedToLibrary(lib) } }
                        }
                    } label: { Label("Add to Library", systemImage: "books.vertical") }
                }
            } label: { Image(systemName: "ellipsis.circle").font(.title3) }
            .tint(XITheme.gold).disabled(store.selectedIds.isEmpty)

            Button(role: .destructive) { Task { await store.bulkDelete() } } label: {
                Image(systemName: "trash").font(.title3)
            }.disabled(store.selectedIds.isEmpty).tint(XITheme.maroon)

            Button("done") { store.exitSelectMode() }
                .font(.system(.body, design: .serif)).tint(XITheme.gold)
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .background(XITheme.navBg)
        .overlay(Rectangle().frame(height: 1).foregroundStyle(XITheme.navBorder), alignment: .top)
    }

    // MARK: content

    @ViewBuilder
    private var content: some View {
        if store.loading {
            Spacer(); ProgressView().tint(XITheme.gold); Spacer()
        } else if store.memories.isEmpty {
            emptyState("No memories yet.", "Tap two touching cards on the board to write one.")
        } else if store.filtered.isEmpty {
            emptyState("No matches.", "Try a different search or clear your filters.")
        } else if store.simplify {
            ScrollView {
                LazyVGrid(columns: simplifyCols, spacing: 10) {
                    ForEach(store.filtered) { m in simplifyCard(m) }
                }.padding(14)
            }
            .scrollDismissesKeyboard(.immediately)
        } else {
            ScrollView {
                LazyVGrid(columns: gridCols, alignment: .leading, spacing: 12) {
                    ForEach(store.filtered) { m in
                        MemoryCard(memory: m,
                                   selectMode: store.selectMode,
                                   selected: store.selectedIds.contains(m.id),
                                   activeTags: Set(store.tagFilters.map(\.tag)),
                                   onOpen: { open(m) },
                                   onTag: { store.toggleTag($0) })
                    }
                }.padding(14)
            }
            .scrollDismissesKeyboard(.immediately)
        }
    }

    private func simplifyCard(_ m: XIMemory) -> some View {
        let title = m.title.isEmpty ? m.content : m.title
        return Text(title.replacingOccurrences(of: ", ", with: " • "))
            .font(.system(size: 12, design: .serif)).foregroundStyle(XITheme.archiveTitle)
            .multilineTextAlignment(.center).lineLimit(4)
            .frame(maxWidth: .infinity, minHeight: 96)
            .padding(8)
            .background(XITheme.archiveCard)
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(store.selectedIds.contains(m.id) ? XITheme.maroon : XITheme.archiveBorder, lineWidth: store.selectedIds.contains(m.id) ? 2 : 1))
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .onTapGesture { open(m) }
    }

    private func open(_ m: XIMemory) {
        if store.selectMode { store.toggleSelected(m.id) } else { detail = m }
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
}

// MARK: - Memory card

private struct MemoryCard: View {
    let memory: XIMemory
    let selectMode: Bool
    let selected: Bool
    let activeTags: Set<String>
    var onOpen: () -> Void
    var onTag: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !memory.title.isEmpty {
                Text(memory.title)
                    .font(.system(.subheadline, design: .serif).weight(.medium))
                    .foregroundStyle(XITheme.archiveTitle).lineLimit(3)
            }
            Text(memory.content)
                .font(.system(.footnote, design: .serif)).foregroundStyle(XITheme.archiveBody)
                .lineLimit(9).fixedSize(horizontal: false, vertical: true)
            if !memory.hashtags.isEmpty {
                FlowTags(tags: Array(memory.hashtags.prefix(3)), active: activeTags, onTag: onTag)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(selected ? XITheme.maroon.opacity(0.06) : XITheme.archiveCard)
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(selected ? XITheme.maroon : XITheme.archiveBorder, lineWidth: selected ? 2 : 1))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(alignment: .topTrailing) {
            if selectMode {
                Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(selected ? XITheme.maroon : XITheme.line)
                    .padding(8).background(.white.opacity(0.6)).clipShape(Circle()).padding(6)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { onOpen() }
    }
}

/// Wrapping row of tappable hashtag chips on a card.
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
                        .foregroundStyle(XITheme.gold)
                        .padding(.vertical, 3).padding(.horizontal, 8)
                        .background(XITheme.gold.opacity(active.contains(xiNormTag(tag)) ? 0.22 : 0.08))
                        .clipShape(Capsule())
                }.buttonStyle(.plain)
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
                        .font(.system(.body, design: .serif)).foregroundStyle(XITheme.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    if !memory.hashtags.isEmpty {
                        HStack {
                            ForEach(memory.hashtags, id: \.self) { tag in
                                Text(tag).font(.system(size: 12, design: .serif)).foregroundStyle(XITheme.gold)
                                    .padding(.vertical, 3).padding(.horizontal, 8)
                                    .background(XITheme.gold.opacity(0.08)).clipShape(Capsule())
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
                    Button("done") { dismiss() }.font(.system(.body, design: .serif)).tint(XITheme.gold)
                }
            }
        }
    }
}
