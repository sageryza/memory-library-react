import SwiftUI
import UIKit

/// Publishes whether the software keyboard is on screen, so the shared nav can
/// slide away while the user writes (matching the web's `.writing` behaviour).
@MainActor
final class KeyboardObserver: ObservableObject {
    @Published var visible = false

    init() {
        let nc = NotificationCenter.default
        nc.addObserver(forName: UIResponder.keyboardWillShowNotification, object: nil, queue: .main) { [weak self] _ in
            self?.visible = true
        }
        nc.addObserver(forName: UIResponder.keyboardWillHideNotification, object: nil, queue: .main) { [weak self] _ in
            self?.visible = false
        }
    }
}

/// The XI app shell: one shared bottom nav spanning all five destinations,
/// matching the web (Today · Curate · Daily · Versus · Library). The nav slides
/// away while a text field is focused so it never crowds the keyboard.
struct XIShell: View {
    @ObservedObject var auth: AuthState
    @State private var tab: XiTab = .today
    @StateObject private var keyboard = KeyboardObserver()

    var body: some View {
        screen
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(XITheme.paper.ignoresSafeArea())
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if !keyboard.visible {
                    XiNavBar(selection: $tab)
                        .transition(.move(edge: .bottom))
                }
            }
            .animation(.easeInOut(duration: 0.2), value: keyboard.visible)
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
