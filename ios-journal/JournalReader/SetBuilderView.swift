import SwiftUI

/// The "Set" nav destination. One button, two sub-tabs:
///  • Drawings   — browse + caption the shared SAGEDIAGRAM pool
///  • Build a Set — pick three drawings into a set of three
struct SetBuilderView: View {
    @StateObject private var model = SetBuilderModel()
    @State private var tab = 0

    var body: some View {
        VStack(spacing: 0) {
            Picker("", selection: $tab) {
                Text("Drawings").tag(0)
                Text("Build a Set").tag(1)
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 16).padding(.top, 10).padding(.bottom, 8)

            if tab == 0 {
                DrawingsTab(model: model)
            } else {
                BuildSetTab(model: model)
            }
        }
        .background(Color.white.ignoresSafeArea())
        .task { await model.loadIfNeeded() }
    }
}

@MainActor
final class SetBuilderModel: ObservableObject {
    @Published var items: [SagediagramItem] = []
    @Published var loading = false
    @Published var error: String?
    @Published var selected: [String] = []      // ids in the current set (max 3)
    private var loaded = false

    var months: [String] {
        let present = Set(items.map { $0.month })
        return sagediagramMonthOrder.filter { present.contains($0) }
    }
    var selectedItems: [SagediagramItem] {
        selected.compactMap { id in items.first { $0.id == id } }
    }

    func loadIfNeeded() async {
        if loaded { return }
        // Show last launch's list straight away, then refresh behind it.
        if items.isEmpty, let cached = SagediagramService.shared.cachedList(), !cached.isEmpty {
            items = sortItems(cached)
        }
        await reload()
    }

    func reload() async {
        loading = true; error = nil
        do {
            items = sortItems(try await SagediagramService.shared.list())
            SagediagramService.shared.saveCache(items)
            loaded = true
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }

    private func sortItems(_ list: [SagediagramItem]) -> [SagediagramItem] {
        list.sorted { (sagediagramMonthRank($0.month), $0.name) < (sagediagramMonthRank($1.month), $1.name) }
    }

    func saveCaption(_ id: String, _ text: String) {
        guard let i = items.firstIndex(where: { $0.id == id }), items[i].caption != text else { return }
        items[i].caption = text
        SagediagramService.shared.saveCache(items)
        Task { try? await SagediagramService.shared.setCaption(id: id, caption: text) }
    }

    func toggleSelect(_ id: String) {
        if let i = selected.firstIndex(of: id) { selected.remove(at: i) }
        else if selected.count < 3 { selected.append(id) }
    }
    func isSelected(_ id: String) -> Bool { selected.contains(id) }
}

// MARK: - Drawings tab (browse + caption)

private struct DrawingsTab: View {
    @ObservedObject var model: SetBuilderModel
    @State private var month: String? = nil   // nil = All
    @State private var query = ""
    @FocusState private var searchFocused: Bool

    private let cols = [GridItem(.adaptive(minimum: 150), spacing: 12)]

    private var shown: [SagediagramItem] {
        var list = model.items
        if let m = month { list = list.filter { $0.month == m } }
        let q = query.trimmingCharacters(in: .whitespaces)
        if !q.isEmpty { list = list.filter { $0.caption.localizedCaseInsensitiveContains(q) } }
        return list
    }

    var body: some View {
        VStack(spacing: 0) {
            searchBar
            monthBar
            if model.loading && model.items.isEmpty {
                Spacer(); ProgressView("Loading drawings…"); Spacer()
            } else if let e = model.error, model.items.isEmpty {
                Spacer(); errorView(e); Spacer()
            } else {
                ScrollView {
                    if shown.isEmpty {
                        Text("No captions match “\(query)”")
                            .font(.footnote).foregroundColor(.gray)
                            .padding(.top, 40)
                    } else {
                        LazyVGrid(columns: cols, spacing: 12) {
                            ForEach(shown) { item in
                                DrawingCell(item: item) { model.saveCaption(item.id, $0) }
                            }
                        }
                        .padding(16)
                    }
                }
                .scrollDismissesKeyboard(.immediately)
            }
        }
    }

    private var searchBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").font(.footnote).foregroundColor(.gray)
            TextField("Search captions", text: $query)
                .font(.footnote)
                .focused($searchFocused)
                .submitLabel(.search)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .onSubmit { searchFocused = false }
                // The bottom nav hides while the keyboard is up, so the keyboard
                // needs its own way out: the standard Done bar above it.
                .toolbar {
                    ToolbarItemGroup(placement: .keyboard) {
                        Spacer()
                        Button("Done") { searchFocused = false }
                    }
                }
            if !query.isEmpty {
                Button {
                    query = ""; searchFocused = false
                } label: {
                    Image(systemName: "xmark.circle.fill").font(.footnote).foregroundColor(.gray)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 10).padding(.vertical, 8)
        .background(Color(white: 0.95))
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .padding(.horizontal, 16).padding(.bottom, 8)
    }

    private var monthBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                chip("All \(model.items.count)", on: month == nil) { month = nil }
                ForEach(model.months, id: \.self) { m in
                    let n = model.items.filter { $0.month == m }.count
                    chip("\(m) \(n)", on: month == m) { month = m }
                }
            }
            .padding(.horizontal, 16).padding(.bottom, 8)
        }
    }

    private func chip(_ label: String, on: Bool, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label).font(.footnote)
                .padding(.horizontal, 12).padding(.vertical, 6)
                .background(on ? Color.black : Color(white: 0.95))
                .foregroundColor(on ? .white : .black)
                .clipShape(RoundedRectangle(cornerRadius: 6))
        }
        .buttonStyle(.plain)
    }

    private func errorView(_ e: String) -> some View {
        VStack(spacing: 10) {
            Text("Couldn't load the shared set").font(.headline)
            Text(e).font(.caption).foregroundColor(.gray).multilineTextAlignment(.center).padding(.horizontal, 24)
            Button("Retry") { Task { await model.reload() } }
                .buttonStyle(.bordered)
        }
    }
}

/// One drawing + its caption field. Saves on return or when editing ends.
private struct DrawingCell: View {
    let item: SagediagramItem
    let onSave: (String) -> Void
    @State private var text: String
    @FocusState private var focused: Bool

    init(item: SagediagramItem, onSave: @escaping (String) -> Void) {
        self.item = item; self.onSave = onSave
        _text = State(initialValue: item.caption)
    }

    var body: some View {
        VStack(spacing: 0) {
            CachedDrawingImage(url: item.url)
                .frame(maxWidth: .infinity)
                .aspectRatio(1, contentMode: .fit)
                .background(Color.white)

            TextField("", text: $text)
                .font(.footnote)
                .focused($focused)
                .submitLabel(.done)
                .onSubmit { onSave(text) }
                .onChange(of: focused) { _, isFocused in if !isFocused { onSave(text) } }
                .padding(8)
                .background(Color.white)
        }
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color(white: 0.85)))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

// MARK: - Build a Set tab (pick three)

private struct BuildSetTab: View {
    @ObservedObject var model: SetBuilderModel
    private let cols = [GridItem(.adaptive(minimum: 120), spacing: 10)]

    var body: some View {
        VStack(spacing: 0) {
            setPreview
            Divider()
            ScrollView {
                LazyVGrid(columns: cols, spacing: 10) {
                    ForEach(model.items) { item in
                        Button { model.toggleSelect(item.id) } label: { thumb(item) }
                            .buttonStyle(.plain)
                    }
                }
                .padding(16)
            }
        }
    }

    private var setPreview: some View {
        VStack(spacing: 6) {
            Text("Your set of three").font(.subheadline.weight(.semibold))
            HStack(spacing: 10) {
                ForEach(0..<3, id: \.self) { i in
                    slot(model.selectedItems.indices.contains(i) ? model.selectedItems[i] : nil)
                }
            }
            Text(model.selected.isEmpty ? "Tap three drawings below to build a set."
                                        : "\(model.selected.count)/3 chosen")
                .font(.caption).foregroundColor(.gray)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12).padding(.horizontal, 16)
    }

    private func slot(_ item: SagediagramItem?) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 8)
                .fill(Color(white: 0.96))
                .aspectRatio(1, contentMode: .fit)
            if let item {
                CachedDrawingImage(url: item.url).padding(4)
            } else {
                Image(systemName: "plus").foregroundColor(.gray)
            }
        }
        .frame(maxWidth: .infinity)
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color(white: 0.85)))
    }

    private func thumb(_ item: SagediagramItem) -> some View {
        let sel = model.isSelected(item.id)
        return ZStack(alignment: .topTrailing) {
            CachedDrawingImage(url: item.url)
                .aspectRatio(1, contentMode: .fit)
                .frame(maxWidth: .infinity)
                .background(Color.white)
                .overlay(RoundedRectangle(cornerRadius: 8)
                    .stroke(sel ? Color.pink : Color(white: 0.85), lineWidth: sel ? 3 : 1))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            if sel {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.white, .pink).padding(6)
            }
        }
    }
}
