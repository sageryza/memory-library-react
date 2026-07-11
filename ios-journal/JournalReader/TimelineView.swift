import SwiftUI
import WebKit

/// The journal timeline: a scrollable visualization of the handwritten journal
/// (Jan 31 – Feb 17, 2025) as vertical colored bands — band height ≈ how much
/// was written, color = kind of content (day / drawings / dreams / ideas /
/// abstract / to-dos). Tap a band to read its text; tap a legend color to read
/// only that kind. Shipped as a self-contained `journal_timeline.html` shown in
/// a WKWebView (the same corpus the drawings project illustrates).
struct TimelineView: View {
    // Matches the timeline's paper color (#ede4d0) so there's no flash of white
    // behind the web view while it loads.
    private static let paper = Color(red: 0.929, green: 0.894, blue: 0.816)

    /// 0 = the handwritten-journal timeline; 1 = the voice memos (dreams +
    /// spoken journals) slotted into the journal by date.
    @State private var mode = 0

    var body: some View {
        VStack(spacing: 0) {
            Picker("View", selection: $mode) {
                Text("Journal").tag(0)
                Text("Voice notes").tag(1)
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 12)
            .padding(.top, 8)
            .padding(.bottom, 6)

            if mode == 0 {
                TimelineWebView()
                    .background(Self.paper)
            } else {
                VoiceEntriesView()
            }
        }
    }
}

/// Loads the bundled timeline HTML from the app bundle. The file is fully
/// self-contained except for the EB Garamond webfont, which loads over the
/// network when available and falls back to Georgia offline.
private struct TimelineWebView: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        let web = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
        web.isOpaque = false
        web.backgroundColor = UIColor(red: 0.929, green: 0.894, blue: 0.816, alpha: 1)
        web.scrollView.backgroundColor = web.backgroundColor
        if let url = Bundle.main.url(forResource: "journal_timeline", withExtension: "html") {
            web.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        }
        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
