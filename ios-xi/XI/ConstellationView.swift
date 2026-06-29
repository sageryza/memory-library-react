import SwiftUI
import UIKit

/// A hand-drawn string between two cards (unordered pair of memory ids).
struct BoardConnection: Identifiable, Equatable {
    let a: String
    let b: String
    var id: String { a < b ? a + "|" + b : b + "|" + a }
    func matches(_ x: String, _ y: String) -> Bool {
        (a == x && b == y) || (a == y && b == x)
    }
}

/// A string being pulled from a card's pin toward the finger (in board space).
struct WireDraft: Equatable {
    let from: String
    var point: CGPoint
}

/// The constellation / "conspiracy board" — a white corkboard of memory cards
/// pinned with crimson push-pins and joined by red string. Faithful to the web
/// look (beige index cards #faf8e9, crimson pins #dc143c). Drag a card to re-pin
/// it, drag empty space to pan, pinch to zoom, tap a card to open it. Long-press
/// a card and drag onto another to draw a string between them (drag back onto a
/// connected card to remove it). Hand-drawn strings persist; cards that merely
/// share a hashtag show as faint dashed suggestions.
struct ConstellationView: View {
    @Environment(\.dismiss) private var dismiss
    let memories: [XIMemory]

    @State private var detail: XIMemory?
    @State private var positions: [String: CGPoint]
    @State private var connections: [BoardConnection] = []
    @State private var wire: WireDraft?

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
                               wire: $wire,
                               orderedIds: memories.map(\.id),
                               cardSize: CGSize(width: Self.cardW, height: Self.cardH),
                               onConnect: toggleConnection) {
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
        .task {
            let saved = await XIService.shared.loadConnections()
            connections = saved.map { BoardConnection(a: $0.0, b: $0.1) }
        }
    }

    /// Long-press from one card released on another: add the string, or remove
    /// it if it already exists. Persists the new set.
    private func toggleConnection(_ from: String, _ to: String) {
        if let i = connections.firstIndex(where: { $0.matches(from, to) }) {
            connections.remove(at: i)
        } else {
            connections.append(BoardConnection(a: from, b: to))
        }
        let pairs = connections.map { ($0.a, $0.b) }
        Task { await XIService.shared.saveConnections(pairs) }
    }

    private var board: some View {
        ZStack {
            Color.white
            Canvas { ctx, _ in
                // Hashtag matches → faint dashed "suggestions".
                for (a, b) in stringPairs {
                    var path = Path()
                    path.move(to: a); path.addLine(to: b)
                    ctx.stroke(path, with: .color(crimson.opacity(0.30)),
                               style: StrokeStyle(lineWidth: 1.5, lineCap: .round, dash: [5, 5]))
                }
                // Hand-drawn strings → solid crimson.
                for c in connections {
                    guard let pa = anchor(c.a), let pb = anchor(c.b) else { continue }
                    var path = Path()
                    path.move(to: pa); path.addLine(to: pb)
                    ctx.stroke(path, with: .color(crimson),
                               style: StrokeStyle(lineWidth: 2, lineCap: .round))
                }
                // The string currently being pulled toward the finger.
                if let w = wire, let pa = anchor(w.from) {
                    var path = Path()
                    path.move(to: pa); path.addLine(to: w.point)
                    ctx.stroke(path, with: .color(crimson.opacity(0.85)),
                               style: StrokeStyle(lineWidth: 2, lineCap: .round))
                    ctx.fill(Path(ellipseIn: CGRect(x: w.point.x - 4, y: w.point.y - 4,
                                                    width: 8, height: 8)),
                             with: .color(crimson))
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

    /// A big board so cards and string have room to roam — no "wall" at the edge.
    /// The initial grid sits in the top-left; the rest is open space to drag into.
    static func canvasSize(_ mems: [XIMemory]) -> CGSize {
        let c = cols(mems.count)
        let rows = Int(ceil(Double(mems.count) / Double(c)))
        let gridW = margin * 2 + CGFloat(c) * colW
        let gridH = margin * 2 + CGFloat(max(1, rows)) * rowH
        return CGSize(width: max(2200, gridW + 900),
                      height: max(3200, gridH + 1600))
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

    /// The pin's anchor point on a card (top-right, where the push-pin sits).
    private func anchor(_ id: String) -> CGPoint? {
        guard let c = positions[id] else { return nil }
        return CGPoint(x: c.x + Self.cardW / 2 - 10, y: c.y - Self.cardH / 2 + 9)
    }

    /// Cards sharing a hashtag, chained — returns the two pin anchor points.
    private var stringPairs: [(CGPoint, CGPoint)] {
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
    @Binding var wire: WireDraft?
    let orderedIds: [String]
    let cardSize: CGSize
    let onConnect: (String, String) -> Void
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
        host.view.clipsToBounds = false
        scroll.addSubview(host.view)
        scroll.contentSize = contentSize

        // Long-press a card to pull a string out toward another card.
        let wirePress = UILongPressGestureRecognizer(target: context.coordinator,
                                                     action: #selector(Coordinator.handleWirePress(_:)))
        wirePress.minimumPressDuration = 0.45
        wirePress.delegate = context.coordinator
        host.view.addGestureRecognizer(wirePress)

        // Card drag wins over scroll pan only when it starts on a card.
        let cardPan = UIPanGestureRecognizer(target: context.coordinator,
                                             action: #selector(Coordinator.handleCardPan(_:)))
        cardPan.delegate = context.coordinator
        cardPan.maximumNumberOfTouches = 1
        host.view.addGestureRecognizer(cardPan)

        // A held card draws string (wins); a moving card drags (wins over scroll).
        scroll.panGestureRecognizer.require(toFail: cardPan)
        scroll.panGestureRecognizer.require(toFail: wirePress)
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
        private var wireFrom: String?

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
            if parent.wire != nil { return }   // a string is being drawn — don't drag
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

        /// Long-press begins a string from the held card; dragging moves its loose
        /// end to the finger; lifting over another card connects (or disconnects).
        @objc func handleWirePress(_ g: UILongPressGestureRecognizer) {
            let p = g.location(in: host.view)
            switch g.state {
            case .began:
                if let id = card(at: p) {
                    wireFrom = id
                    parent.wire = WireDraft(from: id, point: p)
                }
            case .changed:
                guard let from = wireFrom else { return }
                parent.wire = WireDraft(from: from, point: p)
            case .ended:
                if let from = wireFrom, let to = card(at: p), to != from {
                    parent.onConnect(from, to)
                }
                wireFrom = nil
                parent.wire = nil
            default:
                wireFrom = nil
                parent.wire = nil
            }
        }
    }
}
