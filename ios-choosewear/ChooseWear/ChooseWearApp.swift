import SwiftUI

@main
struct ChooseWearApp: App {
    @StateObject private var store = ClosetStore()
    var body: some Scene {
        WindowGroup { RootView().environmentObject(store) }
    }
}

struct RootView: View {
    var body: some View {
        EULAGate(
            theme: .system,
            appName: "Choose What I Wear",
            eulaURL: URL(string: "https://incaseofamnesia.com/eula.html"),
            privacyURL: URL(string: "https://incaseofamnesia.com/privacy.html")
        ) {
            TabView {
                ClosetView()
                    .tabItem { Label("Closet", systemImage: "tshirt") }
                BuilderView()
                    .tabItem { Label("Build", systemImage: "figure.stand") }
                MeView()
                    .tabItem { Label("Me", systemImage: "person.crop.circle") }
            }
        }
    }
}
