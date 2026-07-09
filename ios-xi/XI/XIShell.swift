import SwiftUI
import UIKit

/// The XI app shell: one shared bottom nav spanning all five destinations,
/// matching the web (Today · Curate · Daily · Versus · Library). The nav slides
/// away while a text field is focused so it never crowds the keyboard.
struct XIShell: View {
    @ObservedObject var auth: AuthState
    @State private var tab: XiTab = .today
    @ObservedObject private var deepLink = XIDeepLink.shared

    var body: some View {
        screen
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(XITheme.paper.ignoresSafeArea())
            // The nav is ALWAYS in the safe area — the keyboard simply covers it
            // while typing. It used to be removed/re-inserted around keyboard
            // show/hide, and that animated re-insertion could leave the bar
            // floating above the bottom (the recurring "nav rides up" bug).
            .safeAreaInset(edge: .bottom, spacing: 0) {
                XiNavBar(selection: $tab)
            }
            // A shared-board link jumps to the Library, which offers to add it to
            // your Commons; a Versus link jumps to the Versus tab, which joins.
            .onChange(of: deepLink.pendingShareId) { id in
                if id != nil { tab = .library }
            }
            .onChange(of: deepLink.pendingVersusGameId) { id in
                if id != nil { tab = .versus }
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
