import SwiftUI
import CoreText
import FirebaseCore

@main
struct MiraclesApp: App {
    init() {
        Self.registerFonts()
        Self.configureFirebase()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }

    /// Register the bundled Google fonts (Caveat, Cormorant Garamond) at launch,
    /// so we don't depend on an Info.plist UIAppFonts entry.
    static func registerFonts() {
        let subdirs: [String?] = [nil, "Fonts"]
        for sub in subdirs {
            for ext in ["ttf", "otf"] {
                for url in Bundle.main.urls(forResourcesWithExtension: ext, subdirectory: sub) ?? [] {
                    CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
                }
            }
        }
    }

    /// Configure Firebase from the bundled GoogleService-Info.plist when it's
    /// present, otherwise fall back to explicit options. The explicit values
    /// are the same client config that's in the plist, so this can never crash
    /// the app on a missing/unbundled config file.
    static func configureFirebase() {
        if let path = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
           let options = FirebaseOptions(contentsOfFile: path) {
            FirebaseApp.configure(options: options)
            return
        }

        let options = FirebaseOptions(
            googleAppID: "1:513384339473:ios:bebcb370c3eacafba8b9b0",
            gcmSenderID: "513384339473"
        )
        options.apiKey = "AIzaSyDUS3zBhQohlPY0Cv0WWcq0ADjU3eybOm4"
        options.projectID = "membry-df528"
        options.storageBucket = "membry-df528.firebasestorage.app"
        options.bundleID = "com.sageryza.miracles"
        options.clientID = "513384339473-agkpjunl1s82it39fpf61frpp0jh31ln.apps.googleusercontent.com"
        FirebaseApp.configure(options: options)
    }
}

struct RootView: View {
    // One store for the whole app, however many times this view is made.
    @ObservedObject private var store = MiraclesStore.shared
    @Environment(\.scenePhase) private var scenePhase
    // UI tests jump straight into the book with a deterministic fixture page.
    @State private var opened = AppMode.isUITest

    var body: some View {
        ZStack {
            Theme.paper.ignoresSafeArea()
            if opened {
                BookView(store: store) {
                    withAnimation(.easeInOut(duration: 0.6)) { opened = false }
                }
                .transition(.opacity)
            } else {
                CoverView {
                    withAnimation(.easeInOut(duration: 0.6)) { opened = true }
                }
            }
        }
        // Every background in the app is a fixed cream, so Dark Mode only made
        // the system parts (the clock, sheets) white on cream. Always light.
        .preferredColorScheme(.light)
        // Sign in, then reconcile the book with the cloud. In UI-test mode this
        // only seeds the fixture — no auth, no cloud.
        .task { await store.start() }
        .onChange(of: scenePhase) { phase in
            if phase == .active { store.appBecameActive() }
            if phase == .background { store.appWentToBackground() }
        }
    }
}
