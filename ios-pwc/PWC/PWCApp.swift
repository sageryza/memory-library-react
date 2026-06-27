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
    var body: some View {
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
}
