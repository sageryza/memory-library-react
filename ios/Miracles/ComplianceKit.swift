import SwiftUI

// =============================================================================
// ComplianceKit — shared, themeable safety/compliance UI for the app suite.
//
// Same behavior everywhere, re-skinned per app via ComplianceTheme. v1 ships
// the AI-data consent gate required by App Store Review Guideline 5.1.2(i):
// before any personal content is sent to a third-party AI, the user must be
// told which providers receive it and explicitly agree. Reuse this file in any
// app that calls a third-party AI; pass a theme that matches the app.
//
// (Report / Block components get added here when the UGC apps need them.)
// =============================================================================

/// Visual tokens so one component matches any app's look.
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

/// One provider line shown in the consent sheet (who gets the data + why).
struct AIProvider: Identifiable {
    let id = UUID()
    let name: String
    let role: String
}

/// One-time consent gate for sending user content to third-party AI providers.
/// Present this before the first AI call; persist acceptance with `@AppStorage`.
struct AIConsentSheet: View {
    let theme: ComplianceTheme
    let appName: String
    let providers: [AIProvider]
    let dataDescription: String       // what is sent, e.g. "the text you write"
    var privacyURL: URL? = nil
    var onAgree: () -> Void
    var onCancel: () -> Void

    var body: some View {
        ZStack {
            theme.background.ignoresSafeArea()
            VStack(spacing: 0) {
                // The words scroll; the two buttons stay pinned underneath, so
                // large text can never push "Agree & Continue" off the screen.
                ScrollView {
                    VStack(spacing: 18) {
                        Image(systemName: "sparkles")
                            .font(.system(size: 38))
                            .foregroundStyle(theme.accent)
                            .accessibilityHidden(true)

                        Text("Uses AI")
                            .font(theme.titleFont(28))
                            .foregroundStyle(theme.ink)
                            .accessibilityAddTraits(.isHeader)

                        Text("To create your illustration, \(appName) sends \(dataDescription) to the AI partners below, who generate the picture. It's used only for this — nothing else.")
                            .font(theme.bodyFont(19))
                            .foregroundStyle(theme.subtleInk)
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.horizontal, 4)

                        VStack(alignment: .leading, spacing: 12) {
                            ForEach(providers) { p in
                                HStack(alignment: .firstTextBaseline, spacing: 10) {
                                    Image(systemName: "arrow.up.forward.app.fill")
                                        .foregroundStyle(theme.accent)
                                        .accessibilityHidden(true)
                                    VStack(alignment: .leading, spacing: 1) {
                                        Text(p.name).font(theme.bodyFont(18)).foregroundStyle(theme.ink)
                                        Text(p.role).font(theme.bodyFont(15)).foregroundStyle(theme.subtleInk)
                                    }
                                }
                                .accessibilityElement(children: .combine)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16)
                        .background(theme.card)
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(theme.line))
                        .clipShape(RoundedRectangle(cornerRadius: 10))

                        if let privacyURL {
                            Link("Privacy details", destination: privacyURL)
                                .font(theme.bodyFont(16)).foregroundStyle(theme.accent)
                        }
                    }
                    .padding(.horizontal, 24)
                    .padding(.top, 28)
                    .padding(.bottom, 12)
                    .frame(maxWidth: 460)
                    .frame(maxWidth: .infinity)
                }

                VStack(spacing: 6) {
                    Button(action: onAgree) {
                        Text("Agree & Continue")
                            .font(theme.titleFont(20))
                            .foregroundStyle(theme.accentText)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(theme.accent)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    Button(action: onCancel) {
                        Text("Not now")
                            .font(theme.bodyFont(18)).foregroundStyle(theme.subtleInk)
                            .padding(.vertical, 4)
                    }
                }
                .padding(.horizontal, 24)
                .padding(.top, 10)
                .padding(.bottom, 12)
                .frame(maxWidth: 460)
            }
        }
    }
}
