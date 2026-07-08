import SwiftUI
import FirebaseAuth

/// The account + settings screen, reached from the gear on Today. Holds the
/// account controls that used to live on the Daily board (email, sign out,
/// delete account, manage blocked players) plus Curate — the deck editor —
/// which is a rare, owner-facing task rather than a primary destination.
struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var showDeleteConfirm = false
    @State private var deleteError: String?
    @State private var showBlocked = false
    @State private var titling = false
    @State private var titleResult: String?

    private var email: String? { Auth.auth().currentUser?.email }
    private var isAnon: Bool { Auth.auth().currentUser?.isAnonymous ?? false }

    var body: some View {
        NavigationStack {
            List {
                Section("Account") {
                    if let email {
                        Text(email).foregroundStyle(.secondary)
                    } else if isAnon {
                        Text("Playing without an account").foregroundStyle(.secondary)
                    }
                    Button { showBlocked = true } label: {
                        Label("Manage blocked players", systemImage: "hand.raised")
                    }
                    Button(role: .destructive) {
                        try? XIService.shared.signOut(); dismiss()
                    } label: {
                        Label("Sign out", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                    Button(role: .destructive) {
                        showDeleteConfirm = true
                    } label: {
                        Label("Delete account", systemImage: "trash")
                    }
                }
                Section("Memories") {
                    Button {
                        titling = true
                        Task {
                            let r = await XIService.shared.backfillTitles()
                            titling = false
                            titleResult = r.scanned == 0
                                ? "Every memory already has a title."
                                : "Added \(r.updated) \(r.updated == 1 ? "title" : "titles") to untitled memories."
                        }
                    } label: {
                        HStack {
                            Label("Generate titles for untitled memories", systemImage: "sparkles")
                            if titling { Spacer(); ProgressView() }
                        }
                    }
                    .disabled(titling)
                }
                Section("Cards") {
                    NavigationLink {
                        CurateView()
                    } label: {
                        Label("Curate your deck", systemImage: "heart")
                    }
                }
            }
            .tint(XITheme.gold)
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text("Settings").font(.system(.headline, design: .serif)).foregroundStyle(XITheme.ink)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("done") { dismiss() }.font(.system(.body, design: .serif)).tint(XITheme.gold)
                }
            }
            .sheet(isPresented: $showBlocked) { BlockedUsersView() }
            .confirmationDialog("Delete your account?", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
                Button("Delete account and all my data", role: .destructive) {
                    Task {
                        do { try await XIService.shared.deleteAccount() }
                        catch { deleteError = error.localizedDescription }
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This permanently deletes your account and all your saved memories and boards. This can't be undone.")
            }
            .alert("Couldn't delete account", isPresented: .constant(deleteError != nil)) {
                Button("OK") { deleteError = nil }
            } message: {
                Text(deleteError ?? "")
            }
            .alert("Titles", isPresented: .constant(titleResult != nil)) {
                Button("OK") { titleResult = nil }
            } message: {
                Text(titleResult ?? "")
            }
        }
    }
}
