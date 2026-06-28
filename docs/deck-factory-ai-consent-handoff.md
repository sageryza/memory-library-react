# Deck Factory — AI-consent + icon handoff

Paste this into the **imageforge** session (Deck Factory's code lives in
`sageryza/imageforge`, which is out of scope for the memory-library-react
session, so the change has to happen there).

---

**Task: make Deck Factory App Store–compliant for third-party AI (Guideline 5.1.2(i)) + swap in the new icon.**

**Why:** Deck Factory sends user input to a third-party AI (Replicate, and
possibly OpenAI/Anthropic) to generate cards. As of Nov 2025, Apple's Guideline
**5.1.2(i)** requires an **in-app consent step** before any personal data is
sent to third-party AI — naming the providers — or the app gets rejected/removed.
A sibling app (Miracles) just shipped this exact pattern. Replicate the approach.

## Step 1 — add this reusable file as `ComplianceKit.swift`

(verbatim — it's app-agnostic)

```swift
import SwiftUI

// Shared AI-data consent gate for App Store Guideline 5.1.2(i): before any
// personal content is sent to a third-party AI, name the providers and get
// explicit consent. Pass a ComplianceTheme that matches the app.

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

struct AIProvider: Identifiable {
    let id = UUID()
    let name: String
    let role: String
}

struct AIConsentSheet: View {
    let theme: ComplianceTheme
    let appName: String
    let providers: [AIProvider]
    let dataDescription: String          // what is sent, e.g. "the prompt you enter"
    var privacyURL: URL? = nil
    var onAgree: () -> Void
    var onCancel: () -> Void

    var body: some View {
        ZStack {
            theme.background.ignoresSafeArea()
            VStack(spacing: 18) {
                Spacer(minLength: 6)
                Image(systemName: "sparkles").font(.system(size: 38)).foregroundStyle(theme.accent)
                Text("Uses AI").font(theme.titleFont(28)).foregroundStyle(theme.ink)
                Text("To create your result, \(appName) sends \(dataDescription) to the AI partners below, who generate it. It's used only for this — nothing else.")
                    .font(theme.bodyFont(19)).foregroundStyle(theme.subtleInk)
                    .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true).padding(.horizontal, 4)
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(providers) { p in
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Image(systemName: "arrow.up.forward.app.fill").foregroundStyle(theme.accent)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(p.name).font(theme.bodyFont(18)).foregroundStyle(theme.ink)
                                Text(p.role).font(theme.bodyFont(15)).foregroundStyle(theme.subtleInk)
                            }
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading).padding(16)
                .background(theme.card)
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(theme.line))
                .clipShape(RoundedRectangle(cornerRadius: 10))
                if let privacyURL {
                    Link("Privacy details", destination: privacyURL).font(theme.bodyFont(16)).foregroundStyle(theme.accent)
                }
                Spacer(minLength: 6)
                Button(action: onAgree) {
                    Text("Agree & Continue").font(theme.titleFont(20)).foregroundStyle(theme.accentText)
                        .frame(maxWidth: .infinity).padding(.vertical, 14)
                        .background(theme.accent).clipShape(RoundedRectangle(cornerRadius: 8))
                }
                Button(action: onCancel) {
                    Text("Not now").font(theme.bodyFont(18)).foregroundStyle(theme.subtleInk).padding(.vertical, 4)
                }
            }
            .padding(24).frame(maxWidth: 460)
        }
    }
}
```

## Step 2 — define a Deck Factory theme

(match the app's yellow/black look)

```swift
extension ComplianceTheme {
    static let deckFactory = ComplianceTheme(
        background: Color(red: 0.99, green: 0.80, blue: 0.16),  // yellow
        card: .white, ink: .black, subtleInk: Color(white: 0.25),
        accent: .black, accentText: .white, line: Color(white: 0.0, opacity: 0.15),
        titleFont: { Font.system(size: $0, weight: .heavy) },
        bodyFont:  { Font.system(size: $0) })
}
```

## Step 3 — gate the AI call

Find the function/button that sends user input to Replicate (or your Cloud
Function) to generate a card/deck. Add a one-time consent gate before it:

```swift
@AppStorage("deckfactory.aiConsent.v1") private var aiConsentAccepted = false
@State private var showConsent = false

// where the user taps "generate":
func generateTapped() {
    guard /* input valid */ true else { return }
    if !aiConsentAccepted { showConsent = true; return }
    performGenerate()
}

// attach to the view:
.sheet(isPresented: $showConsent) {
    AIConsentSheet(
        theme: .deckFactory,
        appName: "Deck Factory",
        providers: [
            AIProvider(name: "Replicate", role: "Generates your cards"),
            // add AIProvider(name: "OpenAI"/"Anthropic", role: "...") ONLY if Deck Factory also sends text to them — check the backend
        ],
        dataDescription: "the prompt and any image you provide",
        privacyURL: URL(string: "https://incaseofamnesia.com/privacy.html"),
        onAgree: { aiConsentAccepted = true; showConsent = false; performGenerate() },
        onCancel: { showConsent = false })
}
```

**Important:** list exactly the providers Deck Factory actually sends data to —
check the backend/Cloud Function before finalizing the list.

## Step 4 — new app icon

The owner has a new icon (yellow machine with a gear face spitting out cards).
Drop it into `Assets.xcassets/AppIcon.appiconset/icon-1024.png` as a
**1024×1024 opaque PNG** (no alpha) and update `Contents.json` if needed.

## Notes

- Privacy policy is already hosted at <https://incaseofamnesia.com/privacy.html>
  (it names Anthropic + Replicate and covers "our other apps"). If Deck Factory
  uses a provider not listed there (e.g. OpenAI), tell the owner so the page can
  be updated.
- After these changes, build + upload via the existing imageforge TestFlight
  workflow, then external testing is set up from the `memory-library-react`
  repo (`setup-external-testing.yml`, bundle `com.sageryza.imageforge`).
