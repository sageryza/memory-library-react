import SwiftUI
import FirebaseCore

@main
struct MiraclesApp: App {
    init() {
        Self.configureFirebase()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
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
    @StateObject private var store = MiraclesStore()
    @State private var opened = false

    var body: some View {
        ZStack {
            Theme.paper.ignoresSafeArea()
            if opened {
                BookView(store: store).transition(.opacity)
            } else {
                CoverView {
                    withAnimation(.easeInOut(duration: 0.6)) { opened = true }
                }
            }
        }
        .task {
            try? await MiraclesService.shared.ensureSignedIn()
        }
    }
}
