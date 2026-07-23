import SwiftUI
import WebKit

/// Towers is a **hosted web page** (incaseofamnesia.com/towers) shown in a
/// WKWebView, so its icons, design, and content update by redeploying the site —
/// no app build. Tapping a page reference in a tower posts an `openTimeline`
/// message, which routes to the Timeline tab and lands on that entry.
struct TowersView: View {
    @EnvironmentObject private var router: AppRouter
    private static let paper = Color(red: 0.960, green: 0.941, blue: 0.894)  // #f5f0e4

    var body: some View {
        TowersWebView(onOpenTimeline: { page in router.openTimeline(page: page) })
            .background(Self.paper)
            .ignoresSafeArea(edges: .top)
    }
}

private struct TowersWebView: UIViewRepresentable {
    let onOpenTimeline: (Int) -> Void
    static let url = URL(string: "https://incaseofamnesia.com/towers/")!

    func makeCoordinator() -> Coordinator { Coordinator(onOpenTimeline: onOpenTimeline) }

    func makeUIView(context: Context) -> WKWebView {
        let cfg = WKWebViewConfiguration()
        cfg.userContentController.add(context.coordinator, name: "openTimeline")
        let web = WKWebView(frame: .zero, configuration: cfg)
        web.isOpaque = false
        web.backgroundColor = UIColor(red: 0.960, green: 0.941, blue: 0.894, alpha: 1)
        web.scrollView.backgroundColor = web.backgroundColor
        web.navigationDelegate = context.coordinator
        context.coordinator.web = web
        web.load(URLRequest(url: Self.url))
        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "openTimeline")
    }

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        weak var web: WKWebView?          // weak: breaks the ucc → coordinator → web cycle
        let onOpenTimeline: (Int) -> Void
        init(onOpenTimeline: @escaping (Int) -> Void) { self.onOpenTimeline = onOpenTimeline }

        func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.name == "openTimeline" else { return }
            let page = (message.body as? NSNumber)?.intValue ?? Int("\(message.body)")
            if let page { onOpenTimeline(page) }
        }

        // Offline: if the live page can't load, fall back to the last cached copy.
        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { loadCached() }
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { loadCached() }
        private func loadCached() {
            guard let web = web else { return }
            web.load(URLRequest(url: TowersWebView.url, cachePolicy: .returnCacheDataElseLoad, timeoutInterval: 15))
        }
    }
}
