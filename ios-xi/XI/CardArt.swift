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
    var capFont: Font? = nil      // override the fallback font (Today's deco text-card look)
    /// Trim the picture's OWN printed frame — a thin dark rule inside a white
    /// margin, baked into the card images themselves. Today's plate already
    /// draws the light edge and the gilt line, so the picture's rule lands a
    /// THIRD border inside them. OFF everywhere else: the other screens show
    /// each card exactly as it was drawn.
    var trimFrame: Bool = false

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
                    .font(capFont ?? .system(size: capSize, design: .serif))
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
        guard let img = card.img,
              let url = URL(string: img.hasPrefix("http") ? img : XITheme.cardArtBase + img) else { return }
        let req = URLRequest(url: url, cachePolicy: .returnCacheDataElseLoad)
        // Cache hit first, synchronously — no caption flash for art we have.
        if let cached = URLCache.shared.cachedResponse(for: req),
           let ui = UIImage(data: cached.data) {
            image = trimFrame ? Self.trimmed(ui) : ui
            return
        }
        for attempt in 1...4 {
            if let (data, _) = try? await URLSession.shared.data(for: req),
               let ui = UIImage(data: data) {
                image = trimFrame ? Self.trimmed(ui) : ui
                return
            }
            // Brief backoff, then try again — one dropped LTE packet shouldn't
            // blank a card for the rest of the session.
            try? await Task.sleep(nanoseconds: UInt64(attempt) * 600_000_000)
        }
    }

    /// Crops off the picture's own printed frame. Scans in from each edge for
    /// the first dark run and cuts just past it — done PER IMAGE because the
    /// margin differs from deck to deck (measured Aug 2026 across all five:
    /// 0.3%–6.6% of the width, and it varies card to card inside a deck too,
    /// so no single inset works). Anything it can't read confidently comes
    /// back untouched, so a card can never be mangled by a bad guess.
    private static func trimmed(_ image: UIImage) -> UIImage {
        guard let cg = image.cgImage else { return image }
        let w = cg.width, h = cg.height
        guard w >= 64, h >= 64 else { return image }
        // Redrawn into a known 8-bit gray buffer so the pixel reads don't
        // depend on the source's color space, alpha layout or row padding.
        let buf = UnsafeMutablePointer<UInt8>.allocate(capacity: w * h)
        defer { buf.deallocate() }
        buf.initialize(repeating: 0, count: w * h)
        guard let ctx = CGContext(data: buf, width: w, height: h, bitsPerComponent: 8,
                                 bytesPerRow: w, space: CGColorSpaceCreateDeviceGray(),
                                 bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return image }
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))

        // Never look further in than a tenth of the picture: past that it is
        // the illustration, not a margin.
        let win = max(4, Int(Double(min(w, h)) * 0.10))
        func edge(_ sample: (Int) -> UInt8) -> Int {
            var d = 0
            while d < win, sample(d) >= 100 { d += 1 }
            guard d < win else { return 0 }   // no rule on this edge
            var t = 0
            while t < 3, d + t < win, sample(d + t) < 100 { t += 1 }
            return d + t
        }
        let midY = h / 2, midX = w / 2
        let inset = min(win, max(max(edge { buf[midY * w + $0] },
                                     edge { buf[midY * w + (w - 1 - $0)] }),
                                 max(edge { buf[$0 * w + midX] },
                                     edge { buf[(h - 1 - $0) * w + midX] })))
        guard inset > 0, w - 2 * inset > 16, h - 2 * inset > 16,
              let cut = cg.cropping(to: CGRect(x: inset, y: inset,
                                               width: w - 2 * inset, height: h - 2 * inset))
        else { return image }
        return UIImage(cgImage: cut, scale: image.scale, orientation: image.imageOrientation)
    }

}
