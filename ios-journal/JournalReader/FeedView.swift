import SwiftUI
import WebKit

/// The journal as Instagram — the Journal feed page ImageForge builds (her
/// entries as stories, the reels made from them, her own posts) — as its own
/// tab, opened straight on Reels (2026-10-23, Sophie: "now that we made the
/// Instagram journal thing it's time to attach it to my original JournalReader
/// app. It should be its own tab goes straight to reels").
///
/// A HOSTED PAGE, the Timeline's way. Every new version of the feed is a new
/// page at a new address, so when the tab is first opened it asks ImageForge
/// which page is newest (`GET /api/smalltools`, the `journal` tool — the same
/// lookup Deck Factory's Small tools icon opens it by) and loads it
/// `?embed=1#reels`: no autoscroll pill, open on Reels. Her likes, comments and
/// posts live on ImageForge, so this tab and the Chats app show one feed.
///
/// Nothing loads until she first opens the tab (every tab stays mounted), and a
/// reel never plays while another tab is showing.
struct FeedView: View {
    @EnvironmentObject private var router: AppRouter
    @State private var opened = false
    /// The page is dark — a reel or a story is up — so the strip over the status
    /// bar goes black with it. The tab opens on a reel, so it starts dark.
    @State private var dark = true

    var body: some View {
        let showing = router.tab == .feed
        ZStack {
            if opened { FeedWebView(showing: showing, dark: $dark) }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background((dark ? Color.black : Color.white).ignoresSafeArea())
        // over a reel the strip is black and the status bar steps away, as dark
        // text would vanish on it (the app's own colour scheme is left alone:
        // other tabs use system colours)
        .statusBarHidden(showing && dark)
        .onAppear { if showing { opened = true } }
        .onChange(of: router.tab) { _, tab in if tab == .feed { opened = true } }
    }
}

/// The newest Journal feed page, opened on Reels.
private struct FeedWebView: UIViewRepresentable {
    let showing: Bool
    @Binding var dark: Bool

    static let site = URL(string: "https://imageforge-q125.onrender.com")!
    /// Journal feed v11 — opened only if ImageForge cannot say which page is newest.
    static let knownPage = "S8Y1zEkMJQuMU8Apx3ha"

    func makeCoordinator() -> Coordinator { Coordinator(dark: $dark) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true                 // a reel plays in place, never full screen
        config.mediaTypesRequiringUserActionForPlayback = []    // and the first one starts by itself, with sound
        config.userContentController.add(context.coordinator, name: "journalFeed")   // the page says when it goes dark
        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = .clear
        web.scrollView.backgroundColor = .clear
        web.navigationDelegate = context.coordinator
        context.coordinator.web = web
        context.coordinator.open()
        return web
    }

    func updateUIView(_ web: WKWebView, context: Context) {
        context.coordinator.dark = $dark
        context.coordinator.show(showing)
    }

    static func dismantleUIView(_ web: WKWebView, coordinator: Coordinator) {
        web.configuration.userContentController.removeScriptMessageHandler(forName: "journalFeed")
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        weak var web: WKWebView?
        var dark: Binding<Bool>
        private var showing = true
        private var failed = false

        init(dark: Binding<Bool>) { self.dark = dark }

        /// Ask ImageForge which Journal feed page is newest, then open it on Reels.
        func open() {
            failed = false
            var req = URLRequest(url: FeedWebView.site.appendingPathComponent("api/smalltools"))
            req.timeoutInterval = 10
            URLSession.shared.dataTask(with: req) { [weak self] data, _, _ in
                let id = Self.newestPage(in: data) ?? FeedWebView.knownPage
                DispatchQueue.main.async { self?.load(page: id) }
            }.resume()
        }

        static func newestPage(in data: Data?) -> String? {
            guard let data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let tools = json["tools"] as? [[String: Any]],
                  let tool = tools.first(where: { $0["key"] as? String == "journal" }),
                  let page = tool["page"] as? [String: Any],
                  let id = page["id"] as? String, !id.isEmpty else { return nil }
            return id
        }

        private func load(page id: String) {
            guard let web,
                  var c = URLComponents(url: FeedWebView.site.appendingPathComponent("api/chatfeed/page/\(id)"),
                                        resolvingAgainstBaseURL: false) else { return }
            c.queryItems = [URLQueryItem(name: "embed", value: "1")]   // no autoscroll pill
            c.fragment = "reels"                                        // open on the Reels tab
            if let url = c.url { web.load(URLRequest(url: url)) }
        }

        /// While another tab shows, playback is held; it goes on where it was
        /// when she comes back. A feed that could not load tries again then.
        func show(_ now: Bool) {
            guard now != showing else { return }
            showing = now
            web?.setAllMediaPlaybackSuspended(!now, completionHandler: {})
            if now && failed { open() }
        }

        func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let body = message.body as? [String: Any], let d = body["dark"] as? Bool else { return }
            if dark.wrappedValue != d { dark.wrappedValue = d }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            if !showing { webView.setAllMediaPlaybackSuspended(true, completionHandler: {}) }
        }

        // Offline: the feed opens again the next time she comes to the tab.
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            if (error as NSError).code != NSURLErrorCancelled { failed = true }
        }
        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            if (error as NSError).code != NSURLErrorCancelled { failed = true }
        }

        // iOS dropped the page to free memory: open it again, now or when she is back.
        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            failed = true
            if showing { open() }
        }
    }
}
