import SwiftUI
import UIKit

/// The constellation / "conspiracy board" — a white corkboard of memory cards
/// pinned with crimson push-pins and joined by red string between cards that
/// share a hashtag. Faithful to the web look (beige index cards #faf8e9, crimson
/// pins #dc143c, straight red string). Drag a card to re-pin it, drag empty space
/// to pan, pinch to zoom; tap a card to open it.
struct ConstellationView: View {
    @Environment(\.dismiss) private var dismiss
    let memories: [XIMemory]

    @State private var detail: XIMemory?
    @State private var positions: [String: CGPoint]

    init(memories: [XIMemory]) {
        self.memories = memories
        _positions = State(initialValue: Self.layout(memories))
    }

    // Web palette.
    private let beige = Color(red: 0.980, green: 0.973, blue: 0.914)        // #faf8e9
    private let beigeBorder = Color(red: 0.910, green: 0.902, blue: 0.835)  // #e8e6d5
    private let crimson = Color(red: 0.862, green: 0.078, blue: 0.235)      // #dc143c
    private let slate = Color(red: 0.184, green: 0.310, blue: 0.310)        // #2F4F4F
    private let bodyGrey = Color(red: 0.40, green: 0.40, blue: 0.40)        // #666
    private let maroon = Color(red: 0.502, green: 0.0, blue: 0.125)         // #800020

    static let cardW: CGFloat = 188
    static let cardH: CGFloat = 128
    static let colW: CGFloat = 250
    static let rowH: CGFloat = 210
    static let margin: CGFloat = 110

    var body: some View {
        NavigationStack {
            ZoomableScrollView(contentSize: Self.canvasSize(memories),
                               positions: $positions,
                               orderedIds: memories.map(\.id),
                               cardSize: CGSize(width: Self.cardW, height: Self.cardH)) {
                board.frame(width: Self.canvasSize(memories).width,
                            height: Self.canvasSize(memories).height)
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
                PinCard(memory: m, width: Self.cardW, height: Self.cardH,
                        beige: beige, border: beigeBorder, crimson: crimson,
                        slate: slate, bodyGrey: bodyGrey, maroon: maroon)
                    .position(positions[m.id] ?? center)
                    .onTapGesture { detail = m }
            }
        }
    }

    // MARK: layout (deterministic seed — scattered grid, looks hand-pinned)

    private var center: CGPoint {
        let s = Self.canvasSize(memories); return CGPoint(x: s.width / 2, y: s.height / 2)
    }

    private static func cols(_ n: Int) -> Int { max(2, min(4, Int(ceil(sqrt(Double(max(1, n))))))) }

    static func canvasSize(_ mems: [XIMemory]) -> CGSize {
        let c = cols(mems.count)
        let rows = Int(ceil(Double(mems.count) / Double(c)))
        let w = margin * 2 + CGFloat(c) * colW
        let h = margin * 2 + CGFloat(max(1, rows)) * rowH
        return CGSize(width: max(w, 360), height: max(h, 360))
    }

    static func layout(_ mems: [XIMemory]) -> [String: CGPoint] {
        let c = cols(mems.count)
        var out: [String: CGPoint] = [:]
        for (i, m) in mems.enumerated() {
            let col = i % c, row = i / c
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
        func anchor(_ id: String) -> CGPoint? {
            guard let c = positions[id] else { return nil }
            return CGPoint(x: c.x + Self.cardW / 2 - 10, y: c.y - Self.cardH / 2 + 9)
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

/// UIScrollView-backed canvas: pinch-zoom (0.4×–2.5×) + pan, with a dedicated
/// card-drag recognizer that wins over the scroll pan only when a card is grabbed
/// (empty space pans, two fingers zoom). SwiftUI's ScrollView can do none of this.
private struct ZoomableScrollView<Content: View>: UIViewRepresentable {
    let contentSize: CGSize
    @Binding var positions: [String: CGPoint]
    let orderedIds: [String]
    let cardSize: CGSize
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

        // Card drag wins over scroll pan only when it starts on a card.
        let cardPan = UIPanGestureRecognizer(target: context.coordinator,
                                             action: #selector(Coordinator.handleCardPan(_:)))
        cardPan.delegate = context.coordinator
        cardPan.maximumNumberOfTouches = 1
        host.view.addGestureRecognizer(cardPan)
        scroll.panGestureRecognizer.require(toFail: cardPan)
        return scroll
    }

    func updateUIView(_ scroll: UIScrollView, context: Context) {
        context.coordinator.parent = self
        context.coordinator.host.rootView = content()
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self, host: UIHostingController(rootView: content()))
    }

    final class Coordinator: NSObject, UIScrollViewDelegate, UIGestureRecognizerDelegate {
        var parent: ZoomableScrollView
        let host: UIHostingController<Content>
        private var dragId: String?
        private var dragStart: CGPoint = .zero

        init(parent: ZoomableScrollView, host: UIHostingController<Content>) {
            self.parent = parent; self.host = host
        }

        func viewForZooming(in scrollView: UIScrollView) -> UIView? { host.view }

        /// Topmost card whose frame contains a point in the (unscaled) board space.
        private func card(at p: CGPoint) -> String? {
            let s = parent.cardSize
            for id in parent.orderedIds.reversed() {
                guard let c = parent.positions[id] else { continue }
                let r = CGRect(x: c.x - s.width / 2, y: c.y - s.height / 2, width: s.width, height: s.height)
                if r.contains(p) { return id }
            }
            return nil
        }

        // Only let the card-pan engage when the touch lands on a card.
        func gestureRecognizer(_ g: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
            card(at: touch.location(in: host.view)) != nil
        }

        @objc func handleCardPan(_ g: UIPanGestureRecognizer) {
            switch g.state {
            case .began:
                if let id = card(at: g.location(in: host.view)) {
                    dragId = id; dragStart = parent.positions[id] ?? .zero
                }
            case .changed:
                guard let id = dragId else { return }
                let t = g.translation(in: host.view)
                parent.positions[id] = CGPoint(x: dragStart.x + t.x, y: dragStart.y + t.y)
            default:
                dragId = nil
            }
        }
    }
}
