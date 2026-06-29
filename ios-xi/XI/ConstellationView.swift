import SwiftUI
import UIKit

/// The constellation / "conspiracy board" — a white corkboard of memory cards
/// pinned with crimson push-pins and joined by red string between cards that
/// share a hashtag. Faithful to the web look (beige index cards #faf8e9, crimson
/// pins #dc143c, straight red string). The board pinch-zooms and pans; tap a card
/// to open it.
struct ConstellationView: View {
    @Environment(\.dismiss) private var dismiss
    let memories: [XIMemory]

    @State private var detail: XIMemory?

    // Web palette.
    private let beige = Color(red: 0.980, green: 0.973, blue: 0.914)        // #faf8e9
    private let beigeBorder = Color(red: 0.910, green: 0.902, blue: 0.835)  // #e8e6d5
    private let crimson = Color(red: 0.862, green: 0.078, blue: 0.235)      // #dc143c
    private let slate = Color(red: 0.184, green: 0.310, blue: 0.310)        // #2F4F4F
    private let bodyGrey = Color(red: 0.40, green: 0.40, blue: 0.40)        // #666
    private let maroon = Color(red: 0.502, green: 0.0, blue: 0.125)         // #800020

    private let cardW: CGFloat = 188
    private let cardH: CGFloat = 128
    private let colW: CGFloat = 250
    private let rowH: CGFloat = 210
    private let margin: CGFloat = 110
    private var cols: Int { max(2, min(4, Int(ceil(sqrt(Double(max(1, memories.count))))))) }

    var body: some View {
        NavigationStack {
            ZoomableScrollView(contentSize: canvasSize) {
                board.frame(width: canvasSize.width, height: canvasSize.height)
            }
            .background(Color.white.ignoresSafeArea())
            .navigationTitle("constellation")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Text("\(memories.count) memories")
                        .font(.system(.caption, design: .serif)).foregroundStyle(bodyGrey)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("done") { dismiss() }.font(.system(.body, design: .serif)).tint(crimson)
                }
            }
            .sheet(item: $detail) { m in MemoryDetailSheet(memory: m) }
        }
    }

    private var board: some View {
        ZStack {
            Color.white
            Canvas { ctx, _ in
                for (a, b) in stringPairs {
                    var path = Path()
                    path.move(to: a); path.addLine(to: b)
                    ctx.stroke(path, with: .color(crimson),
                               style: StrokeStyle(lineWidth: 2, lineCap: .round))
                }
            }
            ForEach(memories) { m in
                PinCard(memory: m, width: cardW, height: cardH,
                        beige: beige, border: beigeBorder, crimson: crimson,
                        slate: slate, bodyGrey: bodyGrey, maroon: maroon)
                    .position(positions[m.id] ?? center)
                    .onTapGesture { detail = m }
            }
        }
    }

    // MARK: layout (deterministic — scattered grid, looks hand-pinned)

    private var center: CGPoint { CGPoint(x: canvasSize.width / 2, y: canvasSize.height / 2) }

    private var canvasSize: CGSize {
        let rows = Int(ceil(Double(memories.count) / Double(cols)))
        let w = margin * 2 + CGFloat(cols) * colW
        let h = margin * 2 + CGFloat(max(1, rows)) * rowH
        return CGSize(width: max(w, 360), height: max(h, 360))
    }

    private var positions: [String: CGPoint] {
        var out: [String: CGPoint] = [:]
        for (i, m) in memories.enumerated() {
            let col = i % cols, row = i / cols
            let jx = CGFloat((i &* 73) % 49) - 24
            let jy = CGFloat((i &* 37) % 41) - 20
            let x = margin + cardW / 2 + CGFloat(col) * colW + jx
            let y = margin + cardH / 2 + CGFloat(row) * rowH + jy
            out[m.id] = CGPoint(x: x, y: y)
        }
        return out
    }

    /// Cards sharing a hashtag, chained — returns the two pin anchor points.
    private var stringPairs: [(CGPoint, CGPoint)] {
        let pos = positions
        func anchor(_ id: String) -> CGPoint? {
            guard let c = pos[id] else { return nil }
            return CGPoint(x: c.x + cardW / 2 - 10, y: c.y - cardH / 2 + 9)
        }
        var byTag: [String: [String]] = [:]
        for m in memories { for t in m.hashtags { byTag[t, default: []].append(m.id) } }
        var seen = Set<String>()
        var out: [(CGPoint, CGPoint)] = []
        for ids in byTag.values where ids.count > 1 {
            for k in 1..<ids.count {
                let a = ids[k - 1], b = ids[k]
                let key = a < b ? a + "|" + b : b + "|" + a
                if seen.contains(key) { continue }
                seen.insert(key)
                if let pa = anchor(a), let pb = anchor(b) { out.append((pa, pb)) }
                if out.count > 220 { return out }
            }
        }
        return out
    }
}

/// One pinned memory — a beige index card with a crimson push-pin top-right.
private struct PinCard: View {
    let memory: XIMemory
    let width: CGFloat
    let height: CGFloat
    let beige, border, crimson, slate, bodyGrey, maroon: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if !memory.title.isEmpty {
                Text(memory.title)
                    .font(.system(size: 14, design: .serif).weight(.medium))
                    .foregroundStyle(slate).lineLimit(2)
            }
            if !memory.content.isEmpty {
                Text(memory.content)
                    .font(.system(size: 11, design: .serif)).foregroundStyle(bodyGrey)
                    .lineLimit(3).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
            if !memory.hashtags.isEmpty {
                HStack(spacing: 4) {
                    ForEach(memory.hashtags.prefix(2), id: \.self) { tag in
                        Text(tag)
                            .font(.system(size: 9, design: .monospaced)).foregroundStyle(maroon)
                            .padding(.horizontal, 5).padding(.vertical, 1)
                            .background(crimson.opacity(0.10)).clipShape(Capsule())
                    }
                }
            }
        }
        .padding(12)
        .frame(width: width, height: height, alignment: .leading)
        .background(beige)
        .overlay(RoundedRectangle(cornerRadius: 6).stroke(border, lineWidth: 0.75))
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .shadow(color: .black.opacity(0.13), radius: 4, x: 0, y: 2)
        .overlay(alignment: .topTrailing) { Pushpin(crimson: crimson).offset(x: -3, y: 1) }
    }
}

/// A crimson glossy push-pin head with a thin gray slanted tail.
private struct Pushpin: View {
    let crimson: Color
    var body: some View {
        ZStack(alignment: .topLeading) {
            Capsule().fill(Color(white: 0.6))
                .frame(width: 2, height: 12)
                .rotationEffect(.degrees(15), anchor: .top)
                .offset(x: 11, y: 10)
            Circle()
                .fill(RadialGradient(
                    colors: [Color(red: 1.0, green: 0.42, blue: 0.48), crimson],
                    center: UnitPoint(x: 0.3, y: 0.3), startRadius: 0.5, endRadius: 8))
                .frame(width: 12, height: 12)
                .offset(x: 8, y: 2)
                .shadow(color: .black.opacity(0.3), radius: 1, x: 0, y: 0.5)
        }
        .frame(width: 22, height: 22, alignment: .topLeading)
    }
}

/// A pinch-to-zoom + pan container backed by UIScrollView (SwiftUI's ScrollView
/// can't zoom). Hosts the board and zooms it 0.4×–2.5×.
private struct ZoomableScrollView<Content: View>: UIViewRepresentable {
    let contentSize: CGSize
    @ViewBuilder var content: () -> Content

    func makeUIView(context: Context) -> UIScrollView {
        let scroll = UIScrollView()
        scroll.delegate = context.coordinator
        scroll.minimumZoomScale = 0.4
        scroll.maximumZoomScale = 2.5
        scroll.bouncesZoom = true
        scroll.showsVerticalScrollIndicator = false
        scroll.showsHorizontalScrollIndicator = false
        scroll.backgroundColor = .white

        let host = context.coordinator.host
        host.view.frame = CGRect(origin: .zero, size: contentSize)
        host.view.backgroundColor = .clear
        scroll.addSubview(host.view)
        scroll.contentSize = contentSize
        return scroll
    }

    func updateUIView(_ scroll: UIScrollView, context: Context) {
        context.coordinator.host.rootView = content()
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(host: UIHostingController(rootView: content()))
    }

    final class Coordinator: NSObject, UIScrollViewDelegate {
        let host: UIHostingController<Content>
        init(host: UIHostingController<Content>) { self.host = host }
        func viewForZooming(in scrollView: UIScrollView) -> UIView? { host.view }
    }
}
