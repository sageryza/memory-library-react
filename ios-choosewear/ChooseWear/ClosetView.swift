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
    let item: ClothingItem
    var body: some View {
        Group {
            if let img = item.image {
                Image(uiImage: img).resizable().scaledToFill()
            } else {
                Color(.secondarySystemBackground)
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
            }
            .navigationTitle("Add Item")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save") {
                        if let image { store.add(image, category: category) }
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
