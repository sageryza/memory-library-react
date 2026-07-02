import SwiftUI

struct MeView: View {
    @EnvironmentObject var store: ClosetStore
    @State private var showReport = false
    @State private var reportAck = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    FigureView(figure: store.figure, scale: 1.2)
                        .frame(maxWidth: .infinity).padding(.vertical, 8)
                } header: { Text("Your figure") } footer: {
                    Text("This is your figure for trying on the outfits you build.")
                }

                Section("Profile") {
                    TextField("Display name", text: $store.displayName)
                        .onChange(of: store.displayName) { _ in store.persist() }
                }

                Section("Figure") {
                    Picker("Figure", selection: Binding(
                        get: { store.figure.isBoy ? "boy" : "girl" },
                        set: { store.figure.doll = $0; store.persist() })) {
                        Text("Girl").tag("girl")
                        Text("Boy").tag("boy")
                    }
                    .pickerStyle(.segmented)
                }

                Section("Legal & Safety") {
                    Link("Terms of Use (EULA)", destination: URL(string: "https://incaseofamnesia.com/eula.html")!)
                    Link("Privacy Policy", destination: URL(string: "https://incaseofamnesia.com/privacy.html")!)
                    Button("Report a concern") { showReport = true }
                }

                Section {
                    Text("Build outfits from your closet, save the looks you love, and revisit them anytime.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Me")
            .sheet(isPresented: $showReport) {
                ReportSheet(
                    onSubmit: { _, _ in showReport = false; reportAck = true },
                    onCancel: { showReport = false }
                )
            }
            .alert("Thanks — we'll review this.", isPresented: $reportAck) {
                Button("OK", role: .cancel) {}
            }
        }
    }

}
