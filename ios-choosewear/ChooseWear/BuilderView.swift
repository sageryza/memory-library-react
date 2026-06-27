import SwiftUI

struct BuilderView: View {
    @EnvironmentObject var store: ClosetStore

    @State private var top: UUID?
    @State private var bottom: UUID?
    @State private var full: UUID?       // dress or jumpsuit (covers top+bottom)
    @State private var jacket: UUID?
    @State private var accessory: UUID?
    @State private var requests = ""
    @State private var sent = false

    private var valid: Bool { full != nil || (top != nil && bottom != nil) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    HStack(alignment: .top, spacing: 16) {
                        FigureView(figure: store.figure, scale: 1.1)
                            .frame(width: 110)
                            .padding(.top, 8)
                        VStack(spacing: 10) {
                            slot("Top", item: full ?? top,
                                 hint: full != nil ? "dress / jumpsuit" : "drop a top") { handleUpper($0) }
                            slot("Bottom", item: full != nil ? nil : bottom,
                                 hint: full != nil ? "covered" : "drop a bottom") { handleLower($0) }
                            HStack(spacing: 10) {
                                slot("Jacket", item: jacket, hint: "optional", small: true) { assign($0, .jacket) { jacket = $0 } }
                                slot("Extra", item: accessory, hint: "optional", small: true) { assign($0, .accessory) { accessory = $0 } }
                            }
                        }
                    }
                    .padding(.horizontal)

                    HStack {
                        Image(systemName: valid ? "checkmark.seal.fill" : "exclamationmark.triangle")
                            .foregroundStyle(valid ? .green : .orange)
                        Text(valid ? "Valid outfit" : "Need a top + bottom, or a dress / jumpsuit")
                            .font(.subheadline).foregroundStyle(.secondary)
                        Spacer()
                        Button("Clear") { top = nil; bottom = nil; full = nil; jacket = nil; accessory = nil }
                            .font(.subheadline)
                    }
                    .padding(.horizontal)

                    Divider()

                    ForEach(Category.allCases) { cat in
                        let items = store.items(in: cat)
                        if !items.isEmpty {
                            VStack(alignment: .leading, spacing: 6) {
                                Text(cat.label).font(.subheadline.bold()).padding(.horizontal)
                                ScrollView(.horizontal, showsIndicators: false) {
                                    HStack(spacing: 10) {
                                        ForEach(items) { item in
                                            ClosetThumb(item: item)
                                                .frame(width: 76, height: 100)
                                                .draggable(item.id.uuidString)
                                        }
                                    }
                                    .padding(.horizontal)
                                }
                            }
                        }
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text("Special requests").font(.subheadline.bold())
                        TextField("e.g. roll up your sleeves, tuck in the shirt", text: $requests, axis: .vertical)
                            .textFieldStyle(.roundedBorder).lineLimit(2...4)
                    }
                    .padding(.horizontal)

                    Button {
                        sent = true
                    } label: {
                        Text("Send request  ·  $5 (payment coming soon)")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(!valid)
                    .padding(.horizontal)

                    if store.items.isEmpty {
                        Text("Add clothes in the Closet tab to build an outfit.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 12)
                }
                .padding(.vertical)
            }
            .navigationTitle("Build an Outfit")
            .alert("Request sent (demo)", isPresented: $sent) {
                Button("OK", role: .cancel) {}
            } message: {
                Text("In Phase 2 this charges the chooser and holds the payment in escrow until proof is uploaded.")
            }
        }
    }

    // MARK: drop handling
    private func handleUpper(_ id: String) {
        guard let item = lookup(id) else { return }
        switch item.category {
        case .top: top = item.id; full = nil
        case .dress, .jumpsuit: full = item.id; top = nil; bottom = nil
        default: break
        }
    }
    private func handleLower(_ id: String) {
        guard let item = lookup(id) else { return }
        switch item.category {
        case .bottom: bottom = item.id; full = nil
        case .dress, .jumpsuit: full = item.id; top = nil; bottom = nil
        default: break
        }
    }
    private func assign(_ id: String, _ cat: Category, _ set: (UUID?) -> Void) {
        guard let item = lookup(id), item.category == cat else { return }
        set(item.id)
    }
    private func lookup(_ id: String) -> ClothingItem? {
        guard let uuid = UUID(uuidString: id) else { return nil }
        return store.item(uuid)
    }

    @ViewBuilder
    private func slot(_ title: String, item id: UUID?, hint: String, small: Bool = false,
                      onDrop: @escaping (String) -> Void) -> some View {
        let h: CGFloat = small ? 64 : 92
        ZStack {
            RoundedRectangle(cornerRadius: 10).fill(Color(.secondarySystemBackground))
            RoundedRectangle(cornerRadius: 10).strokeBorder(style: StrokeStyle(lineWidth: 1.5, dash: [5]))
                .foregroundStyle(Color(.separator))
            if let id, let img = store.item(id)?.image {
                Image(uiImage: img).resizable().scaledToFit().padding(6)
            } else {
                VStack(spacing: 2) {
                    Text(title).font(.caption.bold())
                    Text(hint).font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
        .frame(height: h)
        .dropDestination(for: String.self) { ids, _ in
            if let first = ids.first { onDrop(first); return true }
            return false
        }
    }
}
