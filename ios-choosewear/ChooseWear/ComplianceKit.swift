import SwiftUI

// =============================================================================
// ComplianceKit — shared, themeable safety/compliance UI.
//
// This copy ships the pieces a user-content / marketplace app needs to pass
// App Store review (Guideline 1.2): a first-run EULA + Privacy acceptance gate
// with a zero-tolerance notice, and a Report flow. Per-item Report + Block on
// other people's content get wired in once Phase 2 adds the shared feed.
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
    /// Plain system look (Choose What I Wear is unstyled by design for now).
    static let system = ComplianceTheme(
        background: Color(.systemGroupedBackground),
        card: Color(.secondarySystemGroupedBackground),
        ink: Color(.label),
        subtleInk: Color(.secondaryLabel),
        accent: Color.accentColor,
        accentText: .white,
        line: Color(.separator),
        titleFont: { Font.system(size: $0, weight: .semibold) },
        bodyFont: { Font.system(size: $0) }
    )
}

/// Gates the app behind a one-time acceptance of the Terms (EULA) + Privacy
/// Policy, with the zero-tolerance notice Apple expects for UGC apps.
struct EULAGate<Content: View>: View {
    let theme: ComplianceTheme
    let appName: String
    let eulaURL: URL?
    let privacyURL: URL?
    @ViewBuilder var content: Content

    @AppStorage("choosewear.legalAccepted.v1") private var accepted = false

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
                    Text("Please review and accept our terms to continue. \(appName) has a zero-tolerance policy for objectionable content and abusive behavior.")
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

/// Reusable report flow. Wire `onSubmit` to your backend in Phase 2; for now it
/// gives users (and the reviewer) a working way to flag a concern.
struct ReportSheet: View {
    enum Reason: String, CaseIterable, Identifiable {
        case inappropriate = "Inappropriate content"
        case harassment = "Harassment or abuse"
        case spam = "Spam or scam"
        case other = "Other"
        var id: String { rawValue }
    }

    var subjectLabel: String = "a concern"
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
