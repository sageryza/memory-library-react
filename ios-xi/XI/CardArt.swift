import SwiftUI
import UIKit

/// Card art that never leaves a card blank. AsyncImage tries exactly once and
/// gives up forever on a network hiccup — on a flaky connection whole hands
/// rendered as empty white squares. This loads through the shared URLCache
/// (instant when the prefetch already warmed it), retries with backoff when
/// the network drops a request, and shows the card's caption text until — or
/// unless — the art arrives.
struct CardArt: View {
    let card: XICard
    var capSize: CGFloat = 10     // caption fallback font size
    var pad: CGFloat = 2          // art inset from the card edge
    var blend: Bool = true        // multiply the line art over the cream/white tint

    @State private var image: UIImage?

    var body: some View {
        ZStack {
            if let image {
                let art = Image(uiImage: image).resizable().scaledToFit()
                Group {
                    if blend { art.blendMode(.multiply) } else { art }
                }
                .padding(pad)
            } else {
                // Caption while loading / if the art never comes — a card always
                // says what it is.
                Text(card.cap)
                    .font(.system(size: capSize, design: .serif))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(XITheme.ink)
                    .padding(4)
            }
        }
        .task(id: card.img) { await load() }
    }

    @MainActor
    private func load() async {
        image = nil
        guard let img = card.img, let url = URL(string: XITheme.cardArtBase + img) else { return }
        let req = URLRequest(url: url, cachePolicy: .returnCacheDataElseLoad)
        // Cache hit first, synchronously — no caption flash for art we have.
        if let cached = URLCache.shared.cachedResponse(for: req),
           let ui = UIImage(data: cached.data) {
            image = ui
            return
        }
        for attempt in 1...4 {
            if let (data, _) = try? await URLSession.shared.data(for: req),
               let ui = UIImage(data: data) {
                image = ui
                return
            }
            // Brief backoff, then try again — one dropped LTE packet shouldn't
            // blank a card for the rest of the session.
            try? await Task.sleep(nanoseconds: UInt64(attempt) * 600_000_000)
        }
    }
}
