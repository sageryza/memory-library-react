import SwiftUI

// =============================================================================
// ComplianceKit — shared, themeable safety/compliance UI.
//
// PWC has a real user-generated feed, so this copy ships the full Guideline 1.2
// stack: a first-run EULA + Privacy acceptance gate, a Report flow, and a
// Moderation store that lets users block accounts (whose posts are then hidden).
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
    /// People Watching Club look — warm paper, ink, red-orange accent.
    static let pwc = ComplianceTheme(
        background: PWC.paper,
        card: PWC.card,
        ink: PWC.ink,
        subtleInk: PWC.dim,
        accent: PWC.accent,
        accentText: PWC.onAccent,
        line: PWC.line,
        titleFont: { PWC.display($0, .semibold) },
        bodyFont: { .system(size: $0) }
    )
}

/// Tracks blocked accounts so their content can be hidden. Persists locally;
/// in the cloud phase this syncs to the backend.
@MainActor
final class Moderation: ObservableObject {
    @Published private(set) var blocked: Set<String> = []
    private let key = "pwc.blockedHandles.v1"

    init() { blocked = Set(UserDefaults.standard.stringArray(forKey: key) ?? []) }

    func isBlocked(_ handle: String) -> Bool { blocked.contains(handle) }
    func block(_ handle: String) { blocked.insert(handle); persist() }
    func unblock(_ handle: String) { blocked.remove(handle); persist() }
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

    @AppStorage("pwc.legalAccepted.v1") private var accepted = false

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
                    Text("Please review and accept our terms to continue. \(appName) has a zero-tolerance policy for objectionable content and abusive behavior. You can report posts and block accounts at any time.")
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
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    Text("By tapping I Agree you accept the Terms and Privacy Policy.")
                        .font(theme.bodyFont(13)).foregroundStyle(theme.subtleInk)
                }
                .padding(28).frame(maxWidth: 460)
            }
        }
    }
}

/// Reusable report flow for flagging a post or account.
struct ReportSheet: View {
    enum Reason: String, CaseIterable, Identifiable {
        case inappropriate = "Inappropriate content"
        case harassment = "Harassment or abuse"
        case spam = "Spam or scam"
        case privacy = "Shares private information"
        case other = "Other"
        var id: String { rawValue }
    }

    var subjectLabel: String = "this post"
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
