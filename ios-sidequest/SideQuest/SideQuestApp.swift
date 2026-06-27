import SwiftUI
import CoreText

@main
struct SideQuestApp: App {
    @StateObject private var game = GameState()

    init() { Self.registerFonts() }

    var body: some Scene {
        WindowGroup { RootView().environmentObject(game) }
    }

    /// Register the bundled retro fonts (Press Start 2P, VT323) at launch.
    static func registerFonts() {
        let subdirs: [String?] = [nil, "Fonts"]
        for sub in subdirs {
            for url in Bundle.main.urls(forResourcesWithExtension: "ttf", subdirectory: sub) ?? [] {
                CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
            }
        }
    }
}

struct RootView: View {
    @State private var tab = 0

    init() {
        let ub = UITabBarAppearance()
        ub.configureWithOpaqueBackground()
        ub.backgroundColor = UIColor(SQ.panel)
        UITabBar.appearance().standardAppearance = ub
        UITabBar.appearance().scrollEdgeAppearance = ub
    }

    var body: some View {
        TabView(selection: $tab) {
            HomeView(goToQuest: { tab = 1 })
                .tabItem { Label("Home", systemImage: "house.fill") }.tag(0)
            QuestView()
                .tabItem { Label("Quest", systemImage: "flag.checkered") }.tag(1)
            GalleryView()
                .tabItem { Label("Hall", systemImage: "trophy.fill") }.tag(2)
        }
        .tint(SQ.gold)
    }
}
