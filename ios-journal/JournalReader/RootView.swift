import SwiftUI
import Combine

/// The app shell: hosts the five destinations behind one bottom nav. All tabs
/// stay mounted (via a ZStack) so switching away from the Journal mid-edit never
/// loses the current page or unsaved transcription. The nav hides while the
/// keyboard is up so it doesn't crowd typing.
struct RootView: View {
    @State private var selection: JournalTab = .journal
    @StateObject private var keyboard = JournalKeyboardObserver()

    var body: some View {
        ZStack {
            screen(.dreams)   { DreamsPlaceholder() }
            screen(.journal)  { ContentView() }
            screen(.record)   { RecordPlaceholder() }
            screen(.stickers)   { StickersPlaceholder() }
            screen(.setBuilder) { SetBuilderView() }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.white.ignoresSafeArea())
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if !keyboard.visible {
                JournalNavBar(selection: $selection)
                    .transition(.move(edge: .bottom))
            }
        }
        .animation(.easeInOut(duration: 0.2), value: keyboard.visible)
    }

    /// Keep every screen alive but only show/enable the selected one.
    @ViewBuilder
    private func screen<Content: View>(_ tab: JournalTab, @ViewBuilder _ content: () -> Content) -> some View {
        content()
            .opacity(selection == tab ? 1 : 0)
            .allowsHitTesting(selection == tab)
    }
}

/// Publishes whether the software keyboard is on screen (to slide the nav away).
final class JournalKeyboardObserver: ObservableObject {
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

// MARK: - Placeholder screens (to be built out)

/// A simple, intentional-looking "coming soon" screen for the tabs we haven't
/// built yet, so the nav is fully wired and shippable now.
private struct ComingSoon: View {
    let title: String
    let symbol: String
    let subtitle: String
    var accent = Color(red: 1.0, green: 0.7, blue: 0.8)

    var body: some View {
        VStack(spacing: 14) {
            Spacer()
            Image(systemName: symbol)
                .font(.system(size: 46, weight: .light))
                .foregroundStyle(accent)
            if !title.isEmpty {
                Text(title).font(.title2.weight(.semibold)).foregroundColor(.black)
            }
            Text(subtitle)
                .font(.body)
                .foregroundColor(.gray)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.white.ignoresSafeArea())
    }
}

private struct DreamsPlaceholder: View {
    var body: some View { ComingSoon(title: "Dreams", symbol: "cloud", subtitle: "your dream journal will live here.") }
}
private struct RecordPlaceholder: View {
    var body: some View { ComingSoon(title: "Record a note", symbol: "mic", subtitle: "a quick way to capture a note — we'll build this next.") }
}
private struct StickersPlaceholder: View {
    var body: some View { ComingSoon(title: "Stickers", symbol: "square.grid.2x2", subtitle: "generate sticker sheets — wiring this up to ImageForge next.") }
}
private struct SetBuilderPlaceholder: View {
    var body: some View { ComingSoon(title: "Set", symbol: "rectangle.3.group", subtitle: "make a set of three — porting your ImageForge set builder here.") }
}
