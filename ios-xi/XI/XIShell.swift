import SwiftUI

/// The XI app shell: one shared bottom nav spanning all five destinations,
/// matching the web (Today · Curate · Daily · Versus · Library).
struct XIShell: View {
    @ObservedObject var auth: AuthState
    @State private var tab: XiTab = .today

    var body: some View {
        screen
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(XITheme.paper.ignoresSafeArea())
            .safeAreaInset(edge: .bottom, spacing: 0) {
                XiNavBar(selection: $tab)
            }
    }

    @ViewBuilder
    private var screen: some View {
        switch tab {
        case .today: TodayView()
        case .curate: CurateView()
        case .daily: BoardView(auth: auth)
        case .versus: VersusLobbyView(auth: auth)
        case .library: LibraryView()
        }
    }
}
