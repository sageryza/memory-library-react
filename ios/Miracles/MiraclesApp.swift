import SwiftUI
import FirebaseCore

@main
struct MiraclesApp: App {
    init() {
        FirebaseApp.configure()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}

struct RootView: View {
    @StateObject private var store = MiraclesStore()
    @State private var opened = false

    var body: some View {
        ZStack {
            Theme.paper.ignoresSafeArea()
            if opened {
                BookView(store: store).transition(.opacity)
            } else {
                CoverView {
                    withAnimation(.easeInOut(duration: 0.6)) { opened = true }
                }
            }
        }
        .task {
            try? await MiraclesService.shared.ensureSignedIn()
        }
    }
}
