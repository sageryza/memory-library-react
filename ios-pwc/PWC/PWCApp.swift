import SwiftUI

@main
struct PWCApp: App {
    init() {
        let ink = UIColor(PWC.ink)
        let navy = UIColor(PWC.paper)

        // Solid navy nav bar with light serif-ish titles.
        let nav = UINavigationBarAppearance()
        nav.configureWithOpaqueBackground()
        nav.backgroundColor = navy
        nav.shadowColor = UIColor(PWC.line)
        nav.largeTitleTextAttributes = [.foregroundColor: ink]
        nav.titleTextAttributes = [.foregroundColor: ink]
        UINavigationBar.appearance().standardAppearance = nav
        UINavigationBar.appearance().scrollEdgeAppearance = nav
        UINavigationBar.appearance().compactAppearance = nav
        UINavigationBar.appearance().tintColor = UIColor(PWC.accent)

        // Solid navy tab bar, gold selected / muted unselected.
        let tab = UITabBarAppearance()
        tab.configureWithOpaqueBackground()
        tab.backgroundColor = navy
        tab.shadowColor = UIColor(PWC.line)
        UITabBar.appearance().standardAppearance = tab
        UITabBar.appearance().scrollEdgeAppearance = tab
        UITabBar.appearance().tintColor = UIColor(PWC.accent)
        UITabBar.appearance().unselectedItemTintColor = UIColor(PWC.dim)
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
        .preferredColorScheme(.dark)
    }
}
