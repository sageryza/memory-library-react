import SwiftUI
import WebKit

/// The journal timeline: a scrollable visualization of the handwritten journal
/// as vertical colored bands — band height ≈ how much was written, color = kind
/// of content (day / drawings / dreams / ideas / abstract / to-dos). Tap a band
/// to read its text; tap a legend color to filter. Shipped as a self-contained
/// `journal_timeline.html` shown in a WKWebView.
///
/// A Towers page-tap routes here: `router.timelineTargetPage` is handed to the
/// web view, which calls `focusPage(n)` to center that band and open its text.
struct TimelineView: View {
    @EnvironmentObject private var router: AppRouter

    // Matches the timeline's paper color (#ede4d0) so there's no flash of white
    // behind the web view while it loads.
    private static let paper = Color(red: 0.929, green: 0.894, blue: 0.816)

    var body: some View {
        TimelineWebView(targetPage: router.timelineTargetPage,
                        onConsumed: { router.timelineTargetPage = nil })
            .background(Self.paper)
            .ignoresSafeArea(edges: .top)
    }
}

/// Loads the bundled timeline HTML from the app bundle. The file is fully
/// self-contained except for the EB Garamond webfont, which loads over the
/// network when available and falls back to Georgia offline.
private struct TimelineWebView: UIViewRepresentable {
    let targetPage: Int?
    let onConsumed: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let web = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
        web.isOpaque = false
        web.backgroundColor = UIColor(red: 0.929, green: 0.894, blue: 0.816, alpha: 1)
        web.scrollView.backgroundColor = web.backgroundColor
        web.navigationDelegate = context.coordinator
        context.coordinator.web = web
        if let url = Bundle.main.url(forResource: "journal_timeline", withExtension: "html") {
            web.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        }
        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        context.coordinator.consume = onConsumed
        context.coordinator.pending = targetPage
        context.coordinator.apply()
    }

    /// Holds the web view and applies a pending page jump — either right away if
    /// the page is loaded, or once it finishes loading.
    class Coordinator: NSObject, WKNavigationDelegate {
        weak var web: WKWebView?
        var loaded = false
        var pending: Int?
        var consume: (() -> Void)?

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            loaded = true
            apply()
        }

        func apply() {
            guard loaded, let page = pending, let web = web else { return }
            web.evaluateJavaScript("window.focusPage && window.focusPage(\(page))")
            pending = nil
            // Clear the router target off the current update cycle to avoid
            // mutating observed state during a view update.
            let done = consume
            DispatchQueue.main.async { done?() }
        }
    }
}
