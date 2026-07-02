import SwiftUI
import PhotosUI

struct ClosetView: View {
    @EnvironmentObject var store: ClosetStore
    @State private var adding = false

    var body: some View {
        NavigationStack {
            Group {
                if store.items.isEmpty {
                    ContentUnavailableView("Your closet is empty",
                        systemImage: "tshirt",
                        description: Text("Add photos of your clothes to start. Choosers will build outfits from these."))
                } else {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 20) {
                            ForEach(Category.allCases) { cat in
                                let items = store.items(in: cat)
                                if !items.isEmpty {
                                    Text(cat.label).font(.headline).padding(.horizontal)
                                    ScrollView(.horizontal, showsIndicators: false) {
                                        HStack(spacing: 12) {
                                            ForEach(items) { item in
                                                ClosetThumb(item: item)
                                                    .contextMenu {
                                                        Button("Redraw as illustration") { store.draw(item.id) }
                                                        Button("Delete", role: .destructive) { store.remove(item) }
                                                    }
                                            }
                                        }
                                        .padding(.horizontal)
                                    }
                                }
                            }
                        }
                        .padding(.vertical)
                    }
                }
            }
            .navigationTitle("Closet")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { adding = true } label: { Image(systemName: "plus") }
                }
            }
            .sheet(isPresented: $adding) { AddItemSheet() }
        }
    }
}

struct ClosetThumb: View {
    @EnvironmentObject var store: ClosetStore
    let item: ClothingItem
    var body: some View {
        ZStack {
            Color(.secondarySystemBackground)
            if let img = item.image {
                if item.isDrawn {
                    // Illustrations are transparent PNGs — show the whole item.
                    Image(uiImage: img).resizable().scaledToFit().padding(6)
                } else {
                    Image(uiImage: img).resizable().scaledToFill()
                }
            }
            if store.drawing.contains(item.id) {
                Rectangle().fill(.ultraThinMaterial)
                VStack(spacing: 6) {
                    ProgressView()
                    Text("drawing…").font(.caption2).foregroundStyle(.secondary)
                }
            }
        }
        .frame(width: 100, height: 130)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(.separator)))
    }
}

struct AddItemSheet: View {
    @EnvironmentObject var store: ClosetStore
    @Environment(\.dismiss) private var dismiss
    @State private var pick: PhotosPickerItem?
    @State private var image: UIImage?
    @State private var category: Category = .top
    @State private var drawIt = true

    var body: some View {
        NavigationStack {
            Form {
                Section("Photo") {
                    PhotosPicker(selection: $pick, matching: .images) {
                        if let image {
                            Image(uiImage: image).resizable().scaledToFit().frame(height: 220)
                                .frame(maxWidth: .infinity)
                        } else {
                            Label("Choose a photo", systemImage: "photo.on.rectangle")
                        }
                    }
                }
                Section("Category") {
                    Picker("Category", selection: $category) {
                        ForEach(Category.allCases) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.inline).labelsHidden()
                }
                Section {
                    Toggle("Redraw as illustration", isOn: $drawIt)
                } footer: {
                    Text("Turns your photo into a cute drawn version of the item with the background removed. Takes ~20 seconds — the photo shows until the drawing is ready.")
                }
            }
            .navigationTitle("Add Item")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save") {
                        if let image { store.add(image, category: category, draw: drawIt) }
                        dismiss()
                    }.disabled(image == nil).bold()
                }
            }
            .task(id: pick) {
                if let pick, let data = try? await pick.loadTransferable(type: Data.self) {
                    image = UIImage(data: data)
                }
            }
        }
    }
}
