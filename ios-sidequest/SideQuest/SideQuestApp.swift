import SwiftUI
import CoreText
import FirebaseCore

@main
struct SideQuestApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var game = GameState()
    @StateObject private var feed = FeedService()
    @StateObject private var party = PartyService()

    init() {
        Self.registerFonts()
        Self.configureFirebase()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(game)
                .environmentObject(feed)
                .environmentObject(party)
                .onAppear { feed.start(); party.restore() }
        }
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

    /// Configure Firebase (membry-df528, same project as the other apps) from a
    /// bundled GoogleService-Info.plist when present, else explicit options —
    /// same pattern as Miracles, so a missing plist can never crash the app.
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
        options.bundleID = "com.sageryza.sidequest"
        FirebaseApp.configure(options: options)
    }
}

struct RootView: View {
    @State private var showIntro = true

    var body: some View {
        ZStack {
            MainTabs()
            if showIntro {
                IntroView { withAnimation(.easeInOut(duration: 0.5)) { showIntro = false } }
                    .transition(.opacity)
            }
        }
    }
}

struct MainTabs: View {
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
            PartyView()
                .tabItem { Label("Party", systemImage: "person.2.fill") }.tag(2)
            GalleryView()
                .tabItem { Label("Hall", systemImage: "trophy.fill") }.tag(3)
        }
        .tint(SQ.gold)
    }
}
