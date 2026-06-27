import SwiftUI

@main
struct ChooseWearApp: App {
    @StateObject private var store = ClosetStore()
    var body: some Scene {
        WindowGroup { RootView().environmentObject(store) }
    }
}

struct RootView: View {
    var body: some View {
        TabView {
            ClosetView()
                .tabItem { Label("Closet", systemImage: "tshirt") }
            BuilderView()
                .tabItem { Label("Build", systemImage: "figure.stand") }
            MeView()
                .tabItem { Label("Me", systemImage: "person.crop.circle") }
        }
    }
}
