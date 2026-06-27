import SwiftUI
import FirebaseCore

@main
struct XIApp: App {
    init() { Self.configureFirebase() }

    var body: some Scene {
        WindowGroup { BoardView() }
    }

    /// Bundled GoogleService-Info.plist with an explicit-options fallback, so a
    /// missing/unbundled config can never crash launch.
    static func configureFirebase() {
        if let path = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
           let options = FirebaseOptions(contentsOfFile: path) {
            FirebaseApp.configure(options: options)
            return
        }
        let options = FirebaseOptions(
            googleAppID: "1:513384339473:ios:fb53526f5061ea9fa8b9b0",
            gcmSenderID: "513384339473"
        )
        options.apiKey = "AIzaSyDUS3zBhQohlPY0Cv0WWcq0ADjU3eybOm4"
        options.projectID = "membry-df528"
        options.storageBucket = "membry-df528.firebasestorage.app"
        options.bundleID = "com.sageryza.xi"
        options.clientID = "513384339473-if0buongt6cjhhc096usgf3g6iub07nk.apps.googleusercontent.com"
        FirebaseApp.configure(options: options)
    }
}
