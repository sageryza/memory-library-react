import SwiftUI

@main
struct PWCApp: App {
    init() {
        let ink = UIColor(PWC.ink)
        UITabBar.appearance().tintColor = UIColor(PWC.accent)
        UITabBar.appearance().unselectedItemTintColor = UIColor(PWC.dim)
        UINavigationBar.appearance().largeTitleTextAttributes = [.foregroundColor: ink]
        UINavigationBar.appearance().titleTextAttributes = [.foregroundColor: ink]
    }

    var body: some Scene {
        WindowGroup { RootView() }
    }
}

struct RootView: View {
    @StateObject private var moderation = Moderation()

    var body: some View {
        EULAGate(
            theme: .pwc,
            appName: "People Watching Club",
            eulaURL: URL(string: "https://incaseofamnesia.com/eula.html"),
            privacyURL: URL(string: "https://incaseofamnesia.com/privacy.html")
        ) {
            TabView {
                NowView()
                    .tabItem { Label("Now", systemImage: "eye") }
                EventsView()
                    .tabItem { Label("Events", systemImage: "calendar") }
                ShopView()
                    .tabItem { Label("Shop", systemImage: "bag") }
                ClubView()
                    .tabItem { Label("Club", systemImage: "person.crop.rectangle") }
            }
            .tint(PWC.accent)
        }
        .environmentObject(moderation)
    }
}
