import SwiftUI
import UIKit

/// Publishes the keyboard's height. The shell ignores the keyboard's safe area
/// so the nav stays bolted to the bottom — which also disables automatic
/// keyboard avoidance for on-screen text fields. Screens with low-sitting
/// fields use this to pad their scroll content so typing stays visible.
@MainActor
final class KeyboardHeight: ObservableObject {
    static let shared = KeyboardHeight()
    @Published var height: CGFloat = 0

    private init() {
        let nc = NotificationCenter.default
        nc.addObserver(forName: UIResponder.keyboardWillShowNotification, object: nil, queue: .main) { note in
            let h = (note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect)?.height ?? 0
            Task { @MainActor in KeyboardHeight.shared.height = h }
        }
        nc.addObserver(forName: UIResponder.keyboardWillHideNotification, object: nil, queue: .main) { _ in
            Task { @MainActor in KeyboardHeight.shared.height = 0 }
        }
    }
}

/// The XI app shell: one shared bottom nav spanning all five destinations,
/// matching the web (Today · Curate · Daily · Versus · Library). The nav slides
/// away while a text field is focused so it never crowds the keyboard.
struct XIShell: View {
    @ObservedObject var auth: AuthState
    @State private var tab: XiTab = .today
    @ObservedObject private var deepLink = XIDeepLink.shared

    var body: some View {
        // The nav is a real LAYOUT SIBLING below the screens, not a
        // safeAreaInset: an inset added outside each screen's NavigationStack
        // doesn't reliably reach the content inside it, so screens laid
        // themselves out to the SCREEN bottom and slid behind the (opaque)
        // bar — the Library's filter dropdown "stopping above the nav" kept
        // measuring from the wrong bottom. As a sibling, every screen's
        // height ends exactly at the bar's top, no propagation involved.
        VStack(spacing: 0) {
            screen
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            XiNavBar(selection: $tab)
        }
        .background(XITheme.paper.ignoresSafeArea())
        // Ignoring the keyboard's safe area keeps the bar bolted to the
        // bottom of the screen: the keyboard slides OVER it rather than
        // pushing it up.
        .ignoresSafeArea(.keyboard, edges: .bottom)
            // A shared-board link jumps to the Library, which offers to add it to
            // your Commons; a Versus link jumps to the Versus tab, which joins.
            .onChange(of: deepLink.pendingShareId) { id in
                if id != nil { tab = .library }
            }
            .onChange(of: deepLink.pendingVersusGameId) { id in
                if id != nil { tab = .versus }
            }
            // Cold launches: a link that arrived BEFORE the shell mounted never
            // fires onChange — route it on appear too.
            .onAppear {
                if deepLink.pendingShareId != nil { tab = .library }
                if deepLink.pendingVersusGameId != nil { tab = .versus }
            }
    }

    @ViewBuilder
    private var screen: some View {
        switch tab {
        case .today: TodayView()
        case .daily: BoardView()
        case .versus: VersusLobbyView(auth: auth)
        case .board: ConstellationTab()
        case .library: LibraryView()
        }
    }
}

/// Hosts the constellation as a full-screen destination (its own bottom-nav
/// tab) — loads the memories and shows the board. Because it's a tab, not a
/// sheet, it can't be swiped away mid-edit.
struct ConstellationTab: View {
    @State private var memories: [XIMemory] = []
    @State private var loaded = false

    var body: some View {
        Group {
            if loaded {
                ConstellationView(memories: memories, embedded: true)
            } else {
                ProgressView().tint(XITheme.gold)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(XITheme.paper.ignoresSafeArea())
            }
        }
        .task {
            guard !loaded else { return }
            memories = await XIService.shared.allMemories()
            loaded = true
        }
    }
}
