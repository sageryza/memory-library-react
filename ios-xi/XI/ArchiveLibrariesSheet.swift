import SwiftUI

/// Libraries drawer: pick a library to scope the archive to it, see counts and
/// lock state, and create / rename / lock / delete libraries. Locked libraries
/// hide their memories from the main archive until opened here.
struct ArchiveLibrariesSheet: View {
    @ObservedObject var store: ArchiveStore
    @Environment(\.dismiss) private var dismiss

    @State private var showNew = false
    @State private var newName = ""
    @State private var newLocked = false
    @State private var renaming: XILibrary?
    @State private var renameText = ""

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Button {
                        store.selectLibrary(nil); dismiss()
                    } label: {
                        HStack {
                            Image(systemName: "tray.full").foregroundStyle(XITheme.gold)
                            Text("All memories").font(.system(.body, design: .serif)).foregroundStyle(XITheme.ink)
                            Spacer()
                            Text("\(store.memories.count)").font(.system(.footnote, design: .monospaced)).foregroundStyle(XITheme.line)
                            if store.selectedLibraryId == nil {
                                Image(systemName: "checkmark").foregroundStyle(XITheme.gold)
                            }
                        }
                    }
                }
                Section("Libraries") {
                    if store.libraries.isEmpty {
                        Text("No libraries yet. Create one below, or save a search from the filter panel.")
                            .font(.system(.footnote, design: .serif)).foregroundStyle(XITheme.line)
                    }
                    ForEach(store.libraries) { lib in row(lib) }
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(XITheme.paper.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text("libraries")
                        .font(.system(.headline, design: .serif)).foregroundStyle(XITheme.ink)
                }
                ToolbarItem(placement: .topBarLeading) {
                    Button { newName = ""; newLocked = false; showNew = true } label: {
                        Image(systemName: "plus")
                    }.tint(XITheme.gold)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }.tint(XITheme.line).accessibilityLabel("Close")
                }
            }
            .alert("New Library", isPresented: $showNew) {
                TextField("Name", text: $newName)
                Button("Cancel", role: .cancel) {}
                Button("Create") {
                    let n = newName.xiTrimmed; guard !n.isEmpty else { return }
                    Task { await store.createManualLibrary(name: n, ids: [], isLocked: newLocked) }
                }
            } message: {
                Text("Add memories to it later with Select. Locked libraries stay hidden from the main archive until opened.")
            }
            .alert("Rename Library", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
                TextField("Name", text: $renameText)
                Button("Cancel", role: .cancel) { renaming = nil }
                Button("Save") {
                    if let lib = renaming { let n = renameText.xiTrimmed
                        if !n.isEmpty { Task { await store.renameLibrary(lib, to: n) } } }
                    renaming = nil
                }
            }
        }
    }

    private func row(_ lib: XILibrary) -> some View {
        Button {
            store.selectLibrary(lib.id); dismiss()
        } label: {
            HStack(spacing: 10) {
                Circle().fill(color(lib)).frame(width: 10, height: 10)
                VStack(alignment: .leading, spacing: 1) {
                    HStack(spacing: 5) {
                        Text(lib.name).font(.system(.body, design: .serif)).foregroundStyle(XITheme.ink)
                        if lib.isLocked { Image(systemName: "lock.fill").font(.system(size: 10)).foregroundStyle(XITheme.line) }
                        if lib.searchLogic != nil { Image(systemName: "magnifyingglass").font(.system(size: 10)).foregroundStyle(XITheme.line) }
                    }
                    Text(subtitle(lib)).font(.system(size: 11, design: .monospaced)).foregroundStyle(XITheme.line)
                }
                Spacer()
                if store.selectedLibraryId == lib.id { Image(systemName: "checkmark").foregroundStyle(XITheme.gold) }
            }
        }
        .tint(.primary)
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) { Task { await store.deleteLibrary(lib) } } label: { Label("Delete", systemImage: "trash") }
            Button { Task { await store.setLocked(lib, !lib.isLocked) } } label: {
                Label(lib.isLocked ? "Unlock" : "Lock", systemImage: lib.isLocked ? "lock.open" : "lock")
            }.tint(XITheme.maroon)
            Button { renaming = lib; renameText = lib.name } label: { Label("Rename", systemImage: "pencil") }.tint(XITheme.gold)
        }
    }

    private func subtitle(_ lib: XILibrary) -> String {
        let n = lib.count(in: store.memories)
        let kind = lib.searchLogic != nil ? "smart" : "manual"
        return "\(n) \(n == 1 ? "memory" : "memories") · \(kind)"
    }

    private func color(_ lib: XILibrary) -> Color {
        if let hex = lib.colorHex, let c = Color(xiHex: hex) { return c }
        return XITheme.gold
    }
}

extension Color {
    /// Parse "#RRGGBB" / "RRGGBB".
    init?(xiHex: String) {
        var s = xiHex.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6, let v = UInt32(s, radix: 16) else { return nil }
        self.init(red: Double((v >> 16) & 0xFF) / 255,
                  green: Double((v >> 8) & 0xFF) / 255,
                  blue: Double(v & 0xFF) / 255)
    }
}
