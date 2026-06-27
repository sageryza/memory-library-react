import SwiftUI

struct MeView: View {
    @EnvironmentObject var store: ClosetStore

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    FigureView(figure: store.figure, scale: 1.2)
                        .frame(maxWidth: .infinity).padding(.vertical, 8)
                } header: { Text("Your figure") } footer: {
                    Text("Choosers see this figure when they build an outfit for you.")
                }

                Section("Profile") {
                    TextField("Display name", text: $store.displayName)
                        .onChange(of: store.displayName) { _ in store.persist() }
                }

                Section("Skin tone") {
                    swatches(ClosetStore.skinTones, index: store.figure.skin) { store.figure.skin = $0; store.persist() }
                }
                Section("Hair") {
                    Picker("Style", selection: Binding(
                        get: { store.figure.hair },
                        set: { store.figure.hair = $0; store.persist() })) {
                        ForEach(ClosetStore.hairStyles.indices, id: \.self) { i in
                            Text(ClosetStore.hairStyles[i]).tag(i)
                        }
                    }
                    swatches(ClosetStore.hairColors, index: store.figure.hairColor) { store.figure.hairColor = $0; store.persist() }
                }

                Section {
                    Text("Coming in Phase 2: sign-in, become a model (set your prices per day, photo/video add-ons), the booking calendar, escrow payouts via Stripe, and disputes.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Me")
        }
    }

    private func swatches(_ colors: [Color], index: Int, pick: @escaping (Int) -> Void) -> some View {
        HStack(spacing: 12) {
            ForEach(colors.indices, id: \.self) { i in
                Circle().fill(colors[i]).frame(width: 34, height: 34)
                    .overlay(Circle().strokeBorder(.primary, lineWidth: index == i ? 3 : 0))
                    .onTapGesture { pick(i) }
            }
            Spacer()
        }
        .padding(.vertical, 4)
    }
}
