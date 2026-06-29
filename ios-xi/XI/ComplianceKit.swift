import SwiftUI

// =============================================================================
// ComplianceKit — shared, themeable safety/compliance UI.
//
// XI has multiplayer Versus games where players write free-text stories shown to
// the others, so this copy ships the Guideline 1.2 stack: a first-run EULA +
// Privacy acceptance gate, a Report flow, and a Moderation store to block a
// player (their stories are then hidden).
// =============================================================================

struct ComplianceTheme {
    var background: Color
    var card: Color
    var ink: Color
    var subtleInk: Color
    var accent: Color
    var accentText: Color
    var line: Color
    var titleFont: (CGFloat) -> Font
    var bodyFont: (CGFloat) -> Font
}

extension ComplianceTheme {
    /// XI look — warm paper, ink, maroon accent, serif.
    static let xi = ComplianceTheme(
        background: XITheme.paper,
        card: XITheme.white,
        ink: XITheme.ink,
        subtleInk: XITheme.line,
        accent: XITheme.gold,
        accentText: .white,
        line: XITheme.line,
        titleFont: { .system(size: $0, design: .serif).weight(.semibold) },
        bodyFont: { .system(size: $0, design: .serif) }
    )
}

/// Tracks blocked players (by uid) so their stories can be hidden. Persists
/// locally; in a later phase this can sync to the backend.
@MainActor
final class Moderation: ObservableObject {
    @Published private(set) var blocked: Set<String> = []
    private let key = "xi.blockedUids.v1"

    init() { blocked = Set(UserDefaults.standard.stringArray(forKey: key) ?? []) }

    func isBlocked(_ uid: String) -> Bool { blocked.contains(uid) }
    func block(_ uid: String) { guard !uid.isEmpty else { return }; blocked.insert(uid); persist() }
    func unblock(_ uid: String) { blocked.remove(uid); persist() }
    private func persist() { UserDefaults.standard.set(Array(blocked), forKey: key) }
}

/// Gates the app behind a one-time acceptance of the Terms (EULA) + Privacy
/// Policy, with the zero-tolerance notice Apple expects for UGC apps.
struct EULAGate<Content: View>: View {
    let theme: ComplianceTheme
    let appName: String
    let eulaURL: URL?
    let privacyURL: URL?
    @ViewBuilder var content: Content

    @AppStorage("xi.legalAccepted.v1") private var accepted = false

    var body: some View {
        if accepted {
            content
        } else {
            ZStack {
                theme.background.ignoresSafeArea()
                VStack(spacing: 20) {
                    Spacer()
                    Image(systemName: "checkmark.shield.fill")
                        .font(.system(size: 46)).foregroundStyle(theme.accent)
                    Text("Welcome to \(appName)")
                        .font(theme.titleFont(26)).foregroundStyle(theme.ink)
                        .multilineTextAlignment(.center)
                    Text("Please review and accept our terms to continue. \(appName) has a zero-tolerance policy for objectionable content and abusive behavior. In multiplayer games you can report or block other players at any time.")
                        .font(theme.bodyFont(17)).foregroundStyle(theme.subtleInk)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                    VStack(spacing: 10) {
                        if let eulaURL { Link("Terms of Use (EULA)", destination: eulaURL) }
                        if let privacyURL { Link("Privacy Policy", destination: privacyURL) }
                    }
                    .font(theme.bodyFont(17)).tint(theme.accent)
                    Spacer()
                    Button { accepted = true } label: {
                        Text("I Agree")
                            .font(theme.titleFont(19)).foregroundStyle(theme.accentText)
                            .frame(maxWidth: .infinity).padding(.vertical, 14)
                            .background(theme.accent)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                    Text("By tapping I Agree you accept the Terms and Privacy Policy.")
                        .font(theme.bodyFont(13)).foregroundStyle(theme.subtleInk)
                }
                .padding(28).frame(maxWidth: 460)
            }
        }
    }
}

/// Reusable report flow for flagging a story or player.
struct ReportSheet: View {
    enum Reason: String, CaseIterable, Identifiable {
        case inappropriate = "Inappropriate content"
        case harassment = "Harassment or abuse"
        case spam = "Spam or scam"
        case other = "Other"
        var id: String { rawValue }
    }

    var subjectLabel: String = "this"
    var onSubmit: (String, String) -> Void
    var onCancel: () -> Void

    @State private var reason: Reason = .inappropriate
    @State private var details = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Reason") {
                    Picker("Reason", selection: $reason) {
                        ForEach(Reason.allCases) { Text($0.rawValue).tag($0) }
                    }
                }
                Section("Details (optional)") {
                    TextField("What happened?", text: $details, axis: .vertical).lineLimit(3...6)
                }
                Section {
                    Text("There is zero tolerance for objectionable content or abusive users. Reports are reviewed and acted on, typically within 24 hours.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Report \(subjectLabel)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", action: onCancel) }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Submit") { onSubmit(reason.rawValue, details) }
                }
            }
        }
    }
}
