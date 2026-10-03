import SwiftUI

/// Settings, from the gear on the book: the privacy policy and support pages,
/// turning AI drawing off (withdrawing consent — the next draw asks again),
/// and deleting the book, its drawings and the account.
struct SettingsView: View {
    @ObservedObject var store: MiraclesStore
    @Environment(\.dismiss) private var dismiss
    @AppStorage(Keys.aiConsent) private var aiConsent = false
    @State private var askDelete = false
    @State private var deleting = false
    @State private var deleteError: String?

    private let privacyURL = URL(string: "https://incaseofamnesia.com/privacy.html")!
    private let supportURL = URL(string: "https://incaseofamnesia.com/miracles-support.html")!

    var body: some View {
        NavigationStack {
            List {
                Section {
                    linkRow("Privacy Policy", privacyURL)
                    linkRow("Support", supportURL)
                }

                Section {
                    Toggle("Drawing with AI", isOn: $aiConsent)
                        .tint(Theme.gold)
                } footer: {
                    Text("Your words go to Anthropic and OpenAI to make each drawing.")
                }

                Section {
                    Button(role: .destructive) {
                        askDelete = true
                    } label: {
                        HStack {
                            Text("Delete my book and data")
                            Spacer()
                            if deleting { ProgressView() }
                        }
                    }
                    .disabled(deleting || store.rendersInFlight > 0)
                } footer: {
                    if let deleteError {
                        Text(deleteError).foregroundStyle(.red)
                    } else if store.rendersInFlight > 0 {
                        Text("A drawing is still being made. You can delete once it's done.")
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(Theme.paper.ignoresSafeArea())
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .disabled(deleting)
                }
            }
            .alert("Delete your book and data?", isPresented: $askDelete) {
                Button("Delete", role: .destructive) { delete() }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This deletes every page and drawing, on this phone and in the cloud. It can't be undone.")
            }
        }
        .tint(Theme.serifInk)
        .interactiveDismissDisabled(deleting)
    }

    private func linkRow(_ title: String, _ url: URL) -> some View {
        Link(destination: url) {
            HStack {
                Text(title).foregroundStyle(Theme.ink)
                Spacer()
                Image(systemName: "arrow.up.right")
                    .font(.footnote)
                    .foregroundStyle(Theme.muted)
                    .accessibilityHidden(true)
            }
        }
    }

    /// Nothing on this phone is touched unless the server says the cloud copy
    /// and the account are gone.
    private func delete() {
        deleting = true
        deleteError = nil
        Task {
            do {
                try await store.deleteEverything()
                deleting = false
                dismiss()
            } catch {
                deleting = false
                deleteError = MiraclesErrors.message(for: error)
            }
        }
    }
}
