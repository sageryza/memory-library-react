import SwiftUI
import FirebaseAuth
import FirebaseFirestore

/// The user's sharing preference for the public "others" feed — Sage's spec:
/// after about the third memory, a one-time prompt offers three answers
/// (share all / share none / ask each time). "Ask" surfaces a per-memory
/// toggle in the composers, defaulted to private. Changeable in Settings.
/// Mirrors users/{uid}/xiSettings/state.shareMode; nil until answered.
@MainActor
final class SharePrefs: ObservableObject {
    enum Mode: String, CaseIterable {
        case all, none, ask

        var label: String {
            switch self {
            case .all: return "Share my memories"
            case .none: return "Keep them private"
            case .ask: return "Ask me each time"
            }
        }
    }

    static let shared = SharePrefs()

    @Published private(set) var mode: Mode?

    private let key = "xi.shareMode.v1"
    private var hydratedFor: String?
    private var authHandle: AuthStateDidChangeListenerHandle?

    init() {
        mode = UserDefaults.standard.string(forKey: key).flatMap(Mode.init)
        authHandle = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            guard let uid = user?.uid else { return }
            Task { @MainActor in await self?.hydrate(uid: uid) }
        }
    }

    private func stateRef(_ uid: String) -> DocumentReference {
        Firestore.firestore().collection("users").document(uid)
            .collection("xiSettings").document("state")
    }

    private func hydrate(uid: String) async {
        guard hydratedFor != uid else { return }
        hydratedFor = uid
        guard let snap = try? await stateRef(uid).getDocument(),
              let raw = snap.data()?["shareMode"] as? String,
              let m = Mode(rawValue: raw) else { return }
        mode = m
        UserDefaults.standard.set(raw, forKey: key)
    }

    func set(_ m: Mode) {
        mode = m
        UserDefaults.standard.set(m.rawValue, forKey: key)
        guard let uid = Auth.auth().currentUser?.uid else { return }
        Task { try? await stateRef(uid).setData(["shareMode": m.rawValue], merge: true) }
    }

    /// Show the one-time prompt after this save? (Never answered, and the
    /// user has a few memories under their belt — they've felt the app first.)
    func shouldPrompt(totalMemories: Int) -> Bool {
        mode == nil && totalMemories >= 3
    }

    /// Should a memory saved right now go public? (all → yes; ask → whatever
    /// the composer toggle says; none/unanswered → no.)
    func shareForSave(askToggle: Bool) -> Bool {
        switch mode {
        case .all: return true
        case .ask: return askToggle
        default: return false
        }
    }
}

/// The one-time sharing prompt, attachable to any composer. Sage's three
/// answers, with the just-saved memory published immediately when the user
/// picks "all" (older memories stay private — sharing is never retroactive).
struct SharePromptModifier: ViewModifier {
    @Binding var isPresented: Bool
    /// The id of the memory whose save triggered the prompt.
    var savedMemoryId: String?

    func body(content: Content) -> some View {
        content.alert("Share your memories?", isPresented: $isPresented) {
            Button(SharePrefs.Mode.all.label) {
                SharePrefs.shared.set(.all)
                if let id = savedMemoryId {
                    Task { await XIService.shared.setMemoryVisibility(id, isPublic: true) }
                }
            }
            Button(SharePrefs.Mode.ask.label) { SharePrefs.shared.set(.ask) }
            Button(SharePrefs.Mode.none.label) { SharePrefs.shared.set(.none) }
        } message: {
            Text("People who draw the same cards can see memories you share — first name only, and only the ones you make public from now on. You can change this anytime in Settings.")
        }
    }
}

extension View {
    func sharePrompt(isPresented: Binding<Bool>, savedMemoryId: String?) -> some View {
        modifier(SharePromptModifier(isPresented: isPresented, savedMemoryId: savedMemoryId))
    }
}

/// The per-memory "share this one" toggle row shown in composers when the
/// user chose "ask me each time". Defaults to private.
struct ShareToggleRow: View {
    @Binding var isOn: Bool

    var body: some View {
        Toggle(isOn: $isOn) {
            HStack(spacing: 6) {
                Image(systemName: isOn ? "person.2.fill" : "lock")
                    .font(.system(size: 12))
                Text(isOn ? "shared with others who draw these cards" : "private — just for you")
                    .font(.system(size: 13, design: .serif))
            }
            .foregroundStyle(isOn ? XITheme.gold : XITheme.line)
        }
        .tint(XITheme.gold)
    }
}
