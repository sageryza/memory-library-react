import SwiftUI

/// The XI archive — every memory you've written, mirroring the web Archive:
/// text search, boolean hashtag filtering, advanced AND/OR/NOT search, smart &
/// manual Libraries (incl. locked), simplify view, sort, and bulk select-edit.
/// Which memory sheet the archive is showing.
enum MemSheet: Identifiable {
    case add, view(XIMemory), edit(XIMemory)
    var id: String {
        switch self {
        case .add: return "add"
        case .view(let m): return "view-\(m.id)"
        case .edit(let m): return "edit-\(m.id)"
        }
    }
}

struct LibraryView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var store = ArchiveStore()

    @State private var memSheet: MemSheet?
    @State private var filtersExpanded = false
    @State private var showLibraries = false
    @State private var showAddTag = false
    @State private var addTagText = ""
    @State private var showImport = false
    @State private var importText = ""
    @State private var importMsg: String?
    @State private var pendingImport: ArchiveStore.PendingImport?
    @State private var showTrash = false
    @ObservedObject private var deepLink = XIDeepLink.shared
    @ObservedObject private var kb = KeyboardHeight.shared
    @FocusState private var searchFocused: Bool

    private let simplifyCols = [GridItem(.flexible(), spacing: 10),
                                GridItem(.flexible(), spacing: 10),
                                GridItem(.flexible(), spacing: 10)]

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                searchBar
                if filtersExpanded {
                    // Bolted nav = no automatic keyboard avoidance; pad the
                    // panel by the keyboard height so low term boxes can always
                    // be scrolled above it while typing.
                    ScrollView { LibraryFilterPanel(store: store).padding(.bottom, kb.height) }
                        .transition(.move(edge: .top).combined(with: .opacity))
                } else {
                    if !store.tagFilters.isEmpty || store.selectedLibrary != nil { activeBar }
                    content
                }
                if store.selectMode { selectionBar }
            }
            .background(XITheme.paper.ignoresSafeArea())
            // Tapping outside the search box dismisses the keyboard (card taps
            // still win — child gestures take precedence).
            .onTapGesture { searchFocused = false }
            .navigationTitle(store.selectedLibrary?.name ?? "Memory Library")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { toolbarContent }
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { searchFocused = false }
                        .font(.system(.body, design: .serif)).tint(XITheme.gold)
                }
            }
            .sheet(item: $memSheet) { s in
                switch s {
                case .add:
                    MemoryEditorSheet(existing: nil) { t, c, h, x in
                        Task { await store.addMemory(title: t, content: c, hashtagsText: h, context: x) }
                    }
                case .edit(let m):
                    MemoryEditorSheet(existing: m) { t, c, h, x in
                        Task { await store.editMemory(m.id, title: t, content: c, hashtagsText: h, context: x) }
                    }
                case .view(let m):
                    if m.isCommons {
                        MemoryDetailSheet(memory: m,
                                          onRemoveFromCommons: {
                                              Task { await store.removeFromCommons(m.id) }; memSheet = nil
                                          })
                    } else {
                        MemoryDetailSheet(memory: m,
                                          onEdit: { memSheet = .edit(m) },
                                          onTrash: { Task { await store.trash(m.id) }; memSheet = nil })
                    }
                }
            }
            .sheet(isPresented: $showTrash) { TrashSheet(store: store) }
            .sheet(isPresented: $showLibraries) { ArchiveLibrariesSheet(store: store) }
            .alert("Add hashtag", isPresented: $showAddTag) {
                TextField("#tag", text: $addTagText)
                Button("Cancel", role: .cancel) {}
                Button("Add") {
                    let t = addTagText; addTagText = ""
                    Task { await store.bulkAddTag(t) }
                }
            } message: { Text("Adds to the \(store.selectedIds.count) selected memories.") }
            .alert("Import shared board", isPresented: $showImport) {
                TextField("paste share link", text: $importText)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                Button("Cancel", role: .cancel) {}
                Button("Next") {
                    let raw = importText; importText = ""
                    Task {
                        if let p = await store.prepareImport(raw) { pendingImport = p }
                        else { importMsg = "Couldn't find that board." }
                    }
                }
            } message: { Text("Paste a board share link to add its memories to your Commons.") }
            .alert("Add to your Commons?", isPresented: Binding(get: { pendingImport != nil }, set: { if !$0 { pendingImport = nil } }), presenting: pendingImport) { p in
                Button("Add to Commons") {
                    Task {
                        let n = await store.confirmImportToCommons(p.shareId)
                        importMsg = n > 0 ? "Added \(n) \(n == 1 ? "memory" : "memories") from \(p.sharer) to your Commons." : "Nothing new to add."
                    }
                    pendingImport = nil
                }
                Button("Not now", role: .cancel) { pendingImport = nil }
            } message: { p in
                Text("\(p.count) \(p.count == 1 ? "memory" : "memories") from \(p.sharer). They'll live in your Commons, not mixed into your own library.")
            }
            .alert("Import", isPresented: Binding(get: { importMsg != nil }, set: { if !$0 { importMsg = nil } })) {
                Button("OK", role: .cancel) { importMsg = nil }
            } message: { Text(importMsg ?? "") }
        }
        .task { await store.load() }
        // A universal link (incaseofamnesia.com/share/…) resolves here and raises
        // the same "Add to your Commons?" prompt as a pasted link.
        .task(id: deepLink.pendingShareId) {
            guard let id = deepLink.pendingShareId else { return }
            if let p = await store.prepareImport(id) { pendingImport = p }
            else { importMsg = "Couldn't open that shared board." }
            deepLink.pendingShareId = nil
        }
    }

    // MARK: toolbar

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .principal) {
            Text((store.selectedLibrary?.name ?? "Memory Library").uppercased())
                .font(.system(.footnote, design: .monospaced))
                .foregroundStyle(XITheme.navInk)
        }
        ToolbarItemGroup(placement: .topBarLeading) {
            XILogo(height: 20)
            Button { memSheet = .add } label: { Image(systemName: "photo.badge.plus") }
                .tint(XITheme.gold)
                .buttonBorderShape(.roundedRectangle)
                .accessibilityLabel("New memory")
        }
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                Button { store.toggleSelectMode() } label: {
                    Label(store.selectMode ? "Done selecting" : "Select", systemImage: "checkmark.circle")
                }
                Button { showLibraries = true } label: { Label("Libraries", systemImage: "building.columns") }
                Button { showTrash = true } label: { Label("Trash", systemImage: "trash") }
            } label: { Image(systemName: "ellipsis").foregroundStyle(XITheme.gold) }
            .buttonBorderShape(.roundedRectangle)
            .tint(.primary)
        }
    }

    // MARK: bars

    private var searchBar: some View {
        HStack(spacing: 8) {
            // The search box itself (magnifier · field · clear · filters chevron).
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
                Button {
                    searchFocused = false
                    withAnimation(.easeInOut(duration: 0.2)) { filtersExpanded.toggle() }
                } label: {
                    Image(systemName: "arrowtriangle.down.fill")
                        .font(.system(size: 15))
                        .scaleEffect(x: 1.35, y: 0.7)   // wider + shorter arrow
                        .rotationEffect(.degrees(filtersExpanded ? 180 : 0))
                        .foregroundStyle(store.activeFilterCount > 0 ? XITheme.maroon : XITheme.line)
                        .frame(width: 30, height: 30)
                        .contentShape(Rectangle())
                        .overlay(alignment: .topTrailing) {
                            if store.activeFilterCount > 0 && !filtersExpanded {
                                Circle().fill(XITheme.maroon).frame(width: 6, height: 6).offset(x: -2, y: 3)
                            }
                        }
                }
                .accessibilityLabel(filtersExpanded ? "Hide filters" : "Show filters")
            }
            .padding(.horizontal, 12)
            .frame(height: 40)
            .background(XITheme.white)
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(XITheme.line.opacity(0.6)))
            .clipShape(RoundedRectangle(cornerRadius: 8))

            // Simplify / compact toggle lives OUTSIDE the box, right beside it —
            // same height as the search box.
            Button { withAnimation { store.simplify.toggle() } } label: {
                Image(systemName: store.simplify ? "rectangle.grid.1x2" : "square.grid.2x2")
                    .font(.system(size: 18))
                    .foregroundStyle(store.simplify ? XITheme.gold : XITheme.line)
                    .frame(width: 40, height: 40)
                    .background(XITheme.white)
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(XITheme.line.opacity(0.6)))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .accessibilityLabel(store.simplify ? "Detailed view" : "Simplify view")
        }
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
        } else if store.scope == .commons && store.commons.isEmpty {
            emptyState("The Commons is empty.", "Friends' memories from Versus games and shared boards collect here — never robots or strangers.")
        } else if store.scope == .mine && store.memories.isEmpty {
            emptyState("No memories yet.", "Tap ⋯ → New memory to write one, or make one on the board.")
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
            let cols = masonryColumns(store.filtered)
            ScrollView {
                HStack(alignment: .top, spacing: 12) {
                    ForEach(Array(cols.enumerated()), id: \.offset) { _, column in
                        LazyVStack(spacing: 12) {
                            ForEach(column) { m in
                                MemoryCard(memory: m,
                                           selectMode: store.selectMode,
                                           selected: store.selectedIds.contains(m.id),
                                           activeTags: Set(store.tagFilters.map(\.tag)),
                                           onOpen: { open(m) },
                                           onTag: { store.toggleTag($0) })
                            }
                        }
                    }
                }
                .padding(14)
            }
            .scrollDismissesKeyboard(.immediately)
        }
    }

    private func simplifyCard(_ m: XIMemory) -> some View {
        let title = m.title.isEmpty ? m.content : m.title
        return VStack(spacing: 3) {
            Text(title.replacingOccurrences(of: ", ", with: " • "))
                .font(.system(size: 12, design: .serif)).foregroundStyle(XITheme.archiveTitle)
                .multilineTextAlignment(.center).lineLimit(4)
            if m.isCommons {
                Text(m.authorName).font(.system(size: 9, design: .serif).italic())
                    .foregroundStyle(XITheme.gold).lineLimit(1)
            }
        }
            .frame(maxWidth: .infinity, minHeight: 96)
            .padding(8)
            .background(XITheme.archiveCard)
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(store.selectedIds.contains(m.id) ? XITheme.maroon : XITheme.archiveBorder, lineWidth: store.selectedIds.contains(m.id) ? 2 : 1))
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .onTapGesture { open(m) }
    }

    private func open(_ m: XIMemory) {
        if store.selectMode {
            guard !m.isCommons else { return }   // Commons memories aren't yours to bulk-edit
            store.toggleSelected(m.id)
        } else { memSheet = .view(m) }
    }

    // MARK: masonry (pack cards into the shortest column so there are no gaps)

    private func masonryColumns(_ items: [XIMemory], count: Int = 2) -> [[XIMemory]] {
        var cols = Array(repeating: [XIMemory](), count: count)
        var heights = Array(repeating: CGFloat(0), count: count)
        for m in items {
            let i = heights.enumerated().min { $0.element < $1.element }?.offset ?? 0
            cols[i].append(m)
            heights[i] += estimatedHeight(m)
        }
        return cols
    }

    /// Rough height of a card, to balance the masonry columns without measuring.
    private func estimatedHeight(_ m: XIMemory) -> CGFloat {
        var h: CGFloat = 40   // padding + spacing
        if !m.title.isEmpty { h += min(3, ceil(CGFloat(m.title.count) / 20)) * 22 }
        if !m.content.isEmpty { h += min(9, ceil(CGFloat(m.content.count) / 26)) * 16 }
        if !m.hashtags.isEmpty { h += CGFloat(min(3, m.hashtags.count)) * 20 }
        return h
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
            if memory.isCommons {
                HStack(spacing: 4) {
                    Image(systemName: "person.crop.circle").font(.system(size: 10))
                    Text(memory.authorName).font(.system(size: 11, design: .serif).italic())
                }.foregroundStyle(XITheme.gold)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(selected ? XITheme.maroon.opacity(0.06) : XITheme.archiveCard)
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(selected ? XITheme.maroon : XITheme.archiveBorder, lineWidth: selected ? 2 : 1))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(alignment: .topTrailing) {
            if selectMode && !memory.isCommons {
                Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(selected ? XITheme.maroon : XITheme.line)
                    .padding(10)
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
    /// When set (board context), shows a "Remove from board" action.
    var onRemoveFromBoard: (() -> Void)? = nil
    /// When set (archive context), shows Edit / Delete actions.
    var onEdit: (() -> Void)? = nil
    var onTrash: (() -> Void)? = nil
    /// When set (Commons context), shows a "Remove from Commons" action.
    var onRemoveFromCommons: (() -> Void)? = nil

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if memory.isCommons {
                        HStack(spacing: 5) {
                            Image(systemName: "person.crop.circle.fill").font(.system(size: 13))
                            Text("From \(memory.authorName) · the Commons")
                                .font(.system(.footnote, design: .serif).italic())
                        }.foregroundStyle(XITheme.gold)
                    }
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
                    if let onRemoveFromBoard {
                        Button(role: .destructive) {
                            onRemoveFromBoard(); dismiss()
                        } label: {
                            Label("Remove from board", systemImage: "pin.slash")
                                .font(.system(.body, design: .serif))
                        }
                        .tint(XITheme.maroon)
                        .padding(.top, 6)
                    }
                    if let onTrash {
                        Button(role: .destructive) { onTrash() } label: {
                            Label("Delete memory", systemImage: "trash")
                                .font(.system(.body, design: .serif))
                        }
                        .tint(XITheme.maroon)
                        .padding(.top, 6)
                    }
                    if let onRemoveFromCommons {
                        Button(role: .destructive) { onRemoveFromCommons(); dismiss() } label: {
                            Label("Remove from Commons", systemImage: "person.badge.minus")
                                .font(.system(.body, design: .serif))
                        }
                        .tint(XITheme.maroon)
                        .padding(.top, 6)
                    }
                    Spacer()
                }
                .padding(20).frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(XITheme.paper.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if let onEdit {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("edit") { onEdit() }.font(.system(.body, design: .serif)).tint(XITheme.gold)
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }.tint(XITheme.line).accessibilityLabel("Close")
                }
            }
        }
    }
}

/// Add or edit a memory directly — the same fields as the web's Add Memory
/// modal (title, the memory text, hashtags, and optional extra context).
struct MemoryEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let existing: XIMemory?
    var onSave: (_ title: String, _ content: String, _ hashtags: String, _ context: String) -> Void

    @State private var title = ""
    @State private var content = ""
    @State private var hashtags = ""
    @State private var context = ""
    @State private var genTitle = false
    @State private var genTags = false
    @AppStorage("xiMemoryCreateCount") private var createCount = 0
    @FocusState private var focused: Bool

    private var canSave: Bool {
        !(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
          && content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    field("MEMORY") {
                        TextEditor(text: $content)
                            .font(.system(.body, design: .serif)).frame(minHeight: 140)
                            .scrollContentBackground(.hidden).focused($focused)
                    }
                    magicField("TITLE", text: $title, generating: genTitle,
                               nudge: existing == nil && createCount < 2) {
                        await runGenerateTitle()
                    }
                    magicField("HASHTAGS", text: $hashtags, autocorrect: false, generating: genTags,
                               nudge: false) {
                        await runGenerateTags()
                    }
                    field("MORE CONTEXT (optional)") {
                        TextEditor(text: $context)
                            .font(.system(.body, design: .serif)).frame(minHeight: 80)
                            .scrollContentBackground(.hidden).focused($focused)
                    }
                }
                .padding(18)
            }
            .background(XITheme.paper.ignoresSafeArea())
            .navigationTitle(existing == nil ? "new memory" : "edit memory")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }
                        .tint(XITheme.line)
                        .accessibilityLabel("Cancel")
                }
                ToolbarItem(placement: .principal) {
                    Text(existing == nil ? "new memory" : "edit memory")
                        .font(.system(.headline, design: .serif)).foregroundStyle(XITheme.ink)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        if existing == nil { createCount += 1 }
                        onSave(title, content, hashtags, context); dismiss()
                    } label: {
                        Image(systemName: "checkmark")
                    }
                    .tint(XITheme.gold)
                    .disabled(!canSave)
                    .accessibilityLabel("Save")
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer(); Button("Done") { focused = false }.tint(XITheme.gold)
                }
            }
            .onAppear {
                if let m = existing {
                    title = m.title; content = m.content
                    hashtags = m.hashtags.joined(separator: " ")
                    context = m.additionalContext
                }
            }
        }
    }

    private func field<Content: View>(_ label: String, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.system(size: 11, weight: .semibold, design: .monospaced))
                .tracking(1).foregroundStyle(XITheme.navInk)
            content()
                .foregroundStyle(XITheme.ink)
                .padding(10).background(XITheme.white)
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(XITheme.line.opacity(0.6)))
                .clipShape(RoundedRectangle(cornerRadius: 8))
        }
    }

    /// A short one-line field with a square gold "sparkles" button that fills it
    /// in automatically from the memory text.
    private func magicField(_ label: String, text: Binding<String>, autocorrect: Bool = true,
                            generating: Bool, nudge: Bool,
                            action: @escaping () async -> Void) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.system(size: 11, weight: .semibold, design: .monospaced))
                .tracking(1).foregroundStyle(XITheme.navInk)
            HStack(spacing: 8) {
                TextField("", text: text)
                    .font(.system(.body, design: .serif)).foregroundStyle(XITheme.ink)
                    .autocorrectionDisabled(!autocorrect)
                    .textInputAutocapitalization(autocorrect ? .sentences : .never)
                    .focused($focused)
                    .padding(10).background(XITheme.white)
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(XITheme.line.opacity(0.6)))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                Button { Task { await action() } } label: {
                    Group {
                        if generating { ProgressView().tint(XITheme.gold) }
                        else { Image(systemName: "sparkles").font(.system(size: 17)).foregroundStyle(.white) }
                    }
                    .frame(width: 44, height: 44)
                    .background(XITheme.gold)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .disabled(generating || content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .opacity(content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.5 : 1)
                .accessibilityLabel("Generate \(label.lowercased())")
            }
            if nudge {
                Text("✨ tap the star to fill this in automatically")
                    .font(.system(size: 11, design: .serif).italic()).foregroundStyle(XITheme.gold)
            }
        }
    }

    private func runGenerateTitle() async {
        let c = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !c.isEmpty else { return }
        focused = false; genTitle = true
        if let t = await XIService.shared.generateTitle(from: c) { title = t }
        genTitle = false
    }

    private func runGenerateTags() async {
        let c = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !c.isEmpty else { return }
        focused = false; genTags = true
        if let tags = await XIService.shared.generateTags(from: c), !tags.isEmpty {
            hashtags = tags.joined(separator: " ")
        }
        genTags = false
    }
}

/// Recently deleted memories — restore them or delete forever.
struct TrashSheet: View {
    @ObservedObject var store: ArchiveStore
    @Environment(\.dismiss) private var dismiss
    @State private var loading = true

    var body: some View {
        NavigationStack {
            Group {
                if loading {
                    ProgressView().tint(XITheme.gold).frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if store.trashed.isEmpty {
                    VStack(spacing: 8) {
                        Image(systemName: "trash").font(.system(size: 30)).foregroundStyle(XITheme.line)
                        Text("Trash is empty.").font(.system(.body, design: .serif)).foregroundStyle(XITheme.line)
                    }.frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List {
                        ForEach(store.trashed) { m in
                            VStack(alignment: .leading, spacing: 3) {
                                Text(m.title.isEmpty ? m.content : m.title)
                                    .font(.system(.subheadline, design: .serif).weight(.medium))
                                    .foregroundStyle(XITheme.archiveTitle).lineLimit(1)
                                if !m.content.isEmpty && !m.title.isEmpty {
                                    Text(m.content).font(.system(.footnote, design: .serif))
                                        .foregroundStyle(XITheme.archiveBody).lineLimit(1)
                                }
                            }
                            .listRowBackground(XITheme.paper)
                            .swipeActions(edge: .trailing) {
                                Button(role: .destructive) { Task { await store.deleteForever(m.id) } } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                                Button { Task { await store.restore(m.id) } } label: {
                                    Label("Restore", systemImage: "arrow.uturn.backward")
                                }.tint(XITheme.gold)
                            }
                        }
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                }
            }
            .background(XITheme.paper.ignoresSafeArea())
            .navigationTitle("recently deleted")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }.tint(XITheme.line).accessibilityLabel("Close")
                }
            }
            .task { await store.loadTrashed(); loading = false }
        }
    }
}
