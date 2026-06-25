# The Little Book of Miracles — native iOS app

A SwiftUI rewrite of the `/miracles` web page. The **backend is reused unchanged**:
it signs in anonymously with Firebase Auth and calls the existing
`illustrateMiracle` Cloud Function, which distills the moment (Opus 4.8) and draws
it (Replicate), returning a permanent image URL. v1 stores the book locally
(JSON in the app's Documents dir); Firestore cloud sync is a planned follow-up.

> Built remotely and **not yet compiled** — expect a few fixes on the first
> `xcodebuild`. Running Claude Code locally on the Mac (pointed at `ios/`) is the
> fastest way to iterate: it can build, run the Simulator, and fix errors with you.

## One-time setup

1. **Firebase config.** In the [Firebase console](https://console.firebase.google.com/project/membry-df528/settings/general)
   add an **iOS app** (bundle id `com.sageryza.miracles`), download
   **`GoogleService-Info.plist`**, and drop it into `ios/Miracles/`.

2. **Generate the Xcode project.** Two options:
   - **XcodeGen (recommended):** `brew install xcodegen`, then from `ios/` run
     `xcodegen generate`. Opens cleanly with the Firebase Swift Package wired up.
   - **Manual:** create a new Xcode *App* (SwiftUI, iOS 16+), add the firebase-ios-sdk
     Swift Package (`https://github.com/firebase/firebase-ios-sdk`) with products
     **FirebaseAuth** and **FirebaseFunctions**, then add the `Miracles/*.swift`
     files and `GoogleService-Info.plist` to the target.

3. **Build & run** on the Simulator (iOS 16+). Anonymous sign-in happens on launch.

## Files

| File | Role |
|---|---|
| `project.yml` | XcodeGen spec (target, Firebase SPM deps) |
| `Miracles/MiraclesApp.swift` | App entry, `FirebaseApp.configure()` |
| `Miracles/Theme.swift` | Colors |
| `Miracles/Models.swift` | `MiracleBox`, `MiraclePage` |
| `Miracles/MiraclesStore.swift` | Local persistence + book state |
| `Miracles/MiraclesService.swift` | Firebase auth + `illustrateMiracle` callable |
| `Miracles/CoverView.swift` | Passport cover (hinge-open tease) |
| `Miracles/BookView.swift` | Page: date, grid, nav |
| `Miracles/BoxView.swift` | One miracle: frame, draw/undo/redo, caption |

## Notes / next

- The sparkle is the SF Symbol **`sparkles`** (filled three-star, monochrome).
- Handwriting uses the built-in **SnellRoundhand**; we can bundle Caveat to match
  the web exactly later.
- **Cloud sync (Firestore)** + the caption-vs-prompt editing model are the next steps.
