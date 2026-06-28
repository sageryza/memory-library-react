import SwiftUI

/// Saved outfits. Build a look in the Build tab, tap Save, and it lands here —
/// gives the builder a real payoff and makes the app a complete standalone tool.
struct LooksView: View {
    @EnvironmentObject var store: ClosetStore

    var body: some View {
        NavigationStack {
            Group {
                if store.looks.isEmpty {
                    ContentUnavailableView(
                        "No looks yet",
                        systemImage: "rectangle.stack",
                        description: Text("Build an outfit in the Build tab and tap “Save look.”")
                    )
                } else {
                    List {
                        ForEach(store.looks) { look in
                            LookRow(look: look)
                        }
                        .onDelete { store.removeLooks(at: $0) }
                    }
                }
            }
            .navigationTitle("Looks")
            .toolbar { if !store.looks.isEmpty { EditButton() } }
        }
    }
}

private struct LookRow: View {
    @EnvironmentObject var store: ClosetStore
    let look: SavedLook

    var body: some View {
        HStack(spacing: 14) {
            FigureView(figure: store.figure, scale: 0.6)
                .frame(width: 58)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(look.itemIDs, id: \.self) { id in
                        if let img = store.item(id)?.image {
                            Image(uiImage: img).resizable().scaledToFit()
                                .frame(width: 52, height: 68)
                                .background(Color(.secondarySystemBackground))
                                .clipShape(RoundedRectangle(cornerRadius: 6))
                        }
                    }
                }
            }
        }
        .padding(.vertical, 6)
    }
}
