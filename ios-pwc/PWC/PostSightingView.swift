import SwiftUI

struct PostSightingView: View {
    var onPost: (_ note: String, _ place: String, _ hood: String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var note = ""
    @State private var place = ""
    @State private var hood = ""

    private var canPost: Bool {
        !note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !place.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text("What are you seeing?")
                        .font(PWC.display(20, .semibold)).foregroundStyle(PWC.ink)

                    ZStack(alignment: .topLeading) {
                        if note.isEmpty {
                            Text("by the window at La La Land, two men arguing about a croissant 🥐")
                                .font(PWC.display(17)).foregroundStyle(PWC.dim)
                                .padding(.top, 10).padding(.leading, 6)
                        }
                        TextEditor(text: $note)
                            .font(PWC.display(17)).foregroundStyle(PWC.ink)
                            .scrollContentBackground(.hidden).frame(minHeight: 120)
                    }
                    .padding(8)
                    .background(PWC.card)
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(PWC.line))

                    field("Where", "La La Land Café", $place, icon: "mappin")
                    field("Neighborhood", "Silver Lake", $hood, icon: "map")

                    Text("Members near you will see you're watching here.")
                        .font(PWC.mono(11)).foregroundStyle(PWC.sage)
                    Spacer(minLength: 0)
                }
                .padding(20)
                .frame(maxWidth: 560)
                .frame(maxWidth: .infinity)
            }
            .background(PWC.paper.ignoresSafeArea())
            .navigationTitle("New sighting")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }.tint(PWC.dim)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Post") {
                        onPost(note.trimmingCharacters(in: .whitespacesAndNewlines),
                               place.trimmingCharacters(in: .whitespaces),
                               hood.trimmingCharacters(in: .whitespaces).isEmpty ? "nearby" : hood)
                        dismiss()
                    }
                    .font(.body.weight(.semibold)).tint(PWC.accent).disabled(!canPost)
                }
            }
        }
    }

    private func field(_ label: String, _ ph: String, _ text: Binding<String>, icon: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon).foregroundStyle(PWC.sage).frame(width: 18)
            TextField(ph, text: text).font(PWC.mono(14)).foregroundStyle(PWC.ink)
        }
        .padding(12)
        .background(PWC.card)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(PWC.line))
    }
}
