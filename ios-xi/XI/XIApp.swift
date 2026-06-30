import SwiftUI
import FirebaseCore
import GoogleSignIn

@main
struct XIApp: App {
    init() { Self.configureFirebase() }

    var body: some Scene {
        WindowGroup {
            RootView()
                .onOpenURL { url in GIDSignIn.sharedInstance.handle(url) }
        }
    }

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

/// The currently-presented view controller, used to anchor the Google Sign-In
/// sheet from SwiftUI.
@MainActor
func xiTopViewController() -> UIViewController? {
    let scene = UIApplication.shared.connectedScenes
        .compactMap { $0 as? UIWindowScene }
        .first { $0.activationState == .foregroundActive } ?? UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
    var top = scene?.windows.first { $0.isKeyWindow }?.rootViewController
        ?? scene?.windows.first?.rootViewController
    while let presented = top?.presentedViewController { top = presented }
    return top
}

struct RootView: View {
    @StateObject private var auth = AuthState()

    var body: some View {
        EULAGate(
            theme: .xi,
            appName: "XI",
            eulaURL: URL(string: "https://incaseofamnesia.com/eula.html"),
            privacyURL: URL(string: "https://incaseofamnesia.com/privacy.html")
        ) {
            if auth.signedIn {
                XIShell(auth: auth)
            } else {
                SignInView()
            }
        }
    }
}
