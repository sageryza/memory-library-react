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
    @State private var showCurate = false

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
                Section {
                    Picker(selection: Binding(
                        get: { SharePrefs.shared.mode ?? SharePrefs.Mode.none },
                        set: { SharePrefs.shared.set($0) }
                    )) {
                        Text("Share all new memories").tag(SharePrefs.Mode.all)
                        Text("Ask me for each memory").tag(SharePrefs.Mode.ask)
                        Text("Keep everything private").tag(SharePrefs.Mode.none)
                    } label: {
                        Label("Public sharing", systemImage: "person.2")
                    }
                    Toggle(isOn: Binding(
                        get: { SharePrefs.shared.versusPublic },
                        set: { SharePrefs.shared.setVersusPublic($0) }
                    )) {
                        Label("Versus stories are public", systemImage: "globe")
                    }
                    .tint(XITheme.gold)
                } header: {
                    Text("Sharing")
                } footer: {
                    Text("Shared memories appear, first name only, to people who draw the same cards — after an automatic safety check. Versus stories go to the public \"stories i tell\" library unless turned off; any story can be made private from that library. Changing this never shares older memories; those stay as they are.")
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
                    Button { showCurate = true } label: {
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
                    Button { dismiss() } label: { Image(systemName: "xmark") }.tint(XITheme.line).accessibilityLabel("Close")
                }
            }
            .sheet(isPresented: $showBlocked) { BlockedUsersView() }
            // Curate is a full page of its own, not a push inside the settings
            // pull-up sheet.
            .fullScreenCover(isPresented: $showCurate) {
                NavigationStack {
                    CurateView()
                        .toolbar {
                            ToolbarItem(placement: .topBarLeading) {
                                Button { showCurate = false } label: { Image(systemName: "xmark") }
                                    .tint(XITheme.line).accessibilityLabel("Close")
                            }
                        }
                }
            }
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
