import SwiftUI
import UIKit

/// A hand-drawn string between two cards (unordered pair of memory ids), with an
/// optional insight noting what connects them.
struct BoardConnection: Identifiable, Equatable {
    let a: String
    let b: String
    var insight: String = ""
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

/// A point-in-time snapshot of the board, for undo / redo.
struct BoardSnapshot: Equatable {
    var positions: [String: CGPoint]
    var connections: [BoardConnection]
    var placed: Set<String>
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
    @State private var positions: [String: CGPoint] = [:]
    @State private var placed: Set<String> = []
    @State private var connections: [BoardConnection] = []
    @State private var wire: WireDraft?
    @State private var undoStack: [BoardSnapshot] = []
    @State private var redoStack: [BoardSnapshot] = []
    @State private var showAdd = false
    @State private var loaded = false
    @State private var editingConn: BoardConnection?
    @State private var share: ShareInfo?
    @State private var sharing = false

    init(memories: [XIMemory]) {
        self.memories = memories
    }

    /// The memories actually pinned to the board (the curated subset).
    private var boardMemories: [XIMemory] { memories.filter { placed.contains($0.id) } }
    private var offBoard: [XIMemory] { memories.filter { !placed.contains($0.id) } }

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
            ZStack {
                ZoomableScrollView(contentSize: Self.canvasSize(placed.count),
                                   positions: $positions,
                                   wire: $wire,
                                   orderedIds: boardMemories.map(\.id),
                                   cardSize: CGSize(width: Self.cardW, height: Self.cardH),
                                   initialCenter: Self.boardCenter,
                                   onConnect: toggleConnection,
                                   onCardMoveBegan: recordUndo,
                                   onCardMoved: savePositions) {
                    board.frame(width: Self.canvasSize(placed.count).width,
                                height: Self.canvasSize(placed.count).height)
                }
                if loaded && placed.isEmpty { emptyBoard }
            }
            .background(Color.white.ignoresSafeArea())
            .navigationTitle("constellation")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItemGroup(placement: .topBarLeading) {
                    Button { undo() } label: { Image(systemName: "arrow.uturn.backward") }
                        .disabled(undoStack.isEmpty).tint(crimson)
                    Button { redo() } label: { Image(systemName: "arrow.uturn.forward") }
                        .disabled(redoStack.isEmpty).tint(crimson)
                }
                ToolbarItem(placement: .principal) {
                    Text("\(placed.count) on board")
                        .font(.system(.caption, design: .serif)).foregroundStyle(bodyGrey)
                }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Menu {
                        Button { showAdd = true } label: { Label("Add memories", systemImage: "plus") }
                        Button { Task { await shareBoardAction() } } label: {
                            Label(sharing ? "Sharing…" : "Share board", systemImage: "square.and.arrow.up")
                        }.disabled(placed.isEmpty || sharing)
                        Button { scatterAll() } label: { Label("Scatter all", systemImage: "sparkles") }
                            .disabled(offBoard.isEmpty)
                        Button(role: .destructive) { clearBoard() } label: { Label("Clear board", systemImage: "trash") }
                            .disabled(placed.isEmpty)
                    } label: { Image(systemName: "ellipsis.circle") }.tint(crimson)
                    Button("done") { dismiss() }.font(.system(.body, design: .serif)).tint(crimson)
                }
            }
            .sheet(item: $detail) { m in
                MemoryDetailSheet(memory: m, onRemoveFromBoard: { removeFromBoard(m.id) })
            }
            .sheet(isPresented: $showAdd) {
                BoardAddSheet(memories: offBoard) { ids in addToBoard(ids) }
            }
            .sheet(item: $editingConn) { c in
                ConnectionInsightSheet(
                    titleA: memoryTitle(c.a), titleB: memoryTitle(c.b), insight: c.insight,
                    onSave: { setInsight(c, $0) }, onDelete: { deleteConnection(c) })
            }
            .sheet(item: $share) { s in BoardShareSheet(url: s.url) }
        }
        .task {
            guard !loaded else { return }
            async let conns = XIService.shared.loadConnections()
            async let pos = XIService.shared.loadBoardPositions()
            async let placedIds = XIService.shared.loadPlacedIds()
            connections = await conns.map { BoardConnection(a: $0.0, b: $0.1, insight: $0.2) }
            positions = await pos
            placed = Set(await placedIds)
            // Any placed card lacking a saved position gets a tidy slot.
            var i = 0
            for id in placed where positions[id] == nil { positions[id] = Self.slot(i); i += 1 }
            loaded = true
        }
    }

    private var emptyBoard: some View {
        VStack(spacing: 14) {
            Image(systemName: "pin").font(.system(size: 34, weight: .thin)).foregroundStyle(bodyGrey)
            Text("Your board is empty")
                .font(.system(.title3, design: .serif)).foregroundStyle(slate)
            Text("Pin memories to the board to connect them with string.")
                .font(.system(.subheadline, design: .serif)).foregroundStyle(bodyGrey)
                .multilineTextAlignment(.center)
            Button { showAdd = true } label: {
                Label("Add memories", systemImage: "plus")
                    .font(.system(.body, design: .serif).weight(.medium))
                    .foregroundStyle(.white).padding(.vertical, 11).padding(.horizontal, 22)
                    .background(crimson).clipShape(RoundedRectangle(cornerRadius: 6))
            }.padding(.top, 4)
        }
        .padding(28)
    }

    /// Persist the board arrangement after a card is dragged.
    private func savePositions() {
        Task { await XIService.shared.saveBoardPositions(positions) }
    }

    /// Long-press from one card released on another: add the string, or remove
    /// it if it already exists. Persists the new set.
    private func toggleConnection(_ from: String, _ to: String) {
        recordUndo()
        if let i = connections.firstIndex(where: { $0.matches(from, to) }) {
            connections.remove(at: i)
        } else {
            connections.append(BoardConnection(a: from, b: to))
        }
        let pairs = connections.map { ($0.a, $0.b, $0.insight) }
        Task { await XIService.shared.saveConnections(pairs) }
    }

    // MARK: board membership (add / remove / scatter / clear)

    private func addToBoard(_ ids: [String]) {
        guard !ids.isEmpty else { return }
        recordUndo()
        var n = placed.count
        for id in ids where !placed.contains(id) {
            if positions[id] == nil { positions[id] = Self.slot(n) }
            placed.insert(id); n += 1
        }
        persistAll()
    }

    private func removeFromBoard(_ id: String) {
        guard placed.contains(id) else { return }
        recordUndo()
        placed.remove(id)
        persistAll()
    }

    private func scatterAll() {
        recordUndo()
        for (i, m) in memories.enumerated() { positions[m.id] = Self.slot(i) }
        placed = Set(memories.map(\.id))
        persistAll()
    }

    private func clearBoard() {
        recordUndo()
        placed = []
        persistAll()
    }

    /// Publish the board and hand back a shareable web link.
    private func shareBoardAction() async {
        guard !placed.isEmpty else { return }
        sharing = true
        let conns = connections.map { ($0.a, $0.b, $0.insight) }
        let id = await XIService.shared.shareBoard(
            name: "My board", memories: memories, placedIds: Array(placed),
            positions: positions, connections: conns)
        sharing = false
        if let id, let url = URL(string: "https://incaseofamnesia.com/share/\(id)") {
            share = ShareInfo(url: url)
        }
    }

    // MARK: undo / redo (membership + card moves + connection add/remove)

    /// Snapshot the board before a change.
    private func recordUndo() {
        undoStack.append(BoardSnapshot(positions: positions, connections: connections, placed: placed))
        if undoStack.count > 50 { undoStack.removeFirst() }
        redoStack.removeAll()
    }

    private func undo() {
        guard let prev = undoStack.popLast() else { return }
        redoStack.append(BoardSnapshot(positions: positions, connections: connections, placed: placed))
        positions = prev.positions; connections = prev.connections; placed = prev.placed
        persistAll()
    }

    private func redo() {
        guard let next = redoStack.popLast() else { return }
        undoStack.append(BoardSnapshot(positions: positions, connections: connections, placed: placed))
        positions = next.positions; connections = next.connections; placed = next.placed
        persistAll()
    }

    private func persistAll() {
        savePositions()
        let pairs = connections.map { ($0.a, $0.b, $0.insight) }
        let ids = Array(placed)
        Task {
            await XIService.shared.saveConnections(pairs)
            await XIService.shared.savePlacedIds(ids)
        }
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
                // Hand-drawn strings → solid crimson (only between placed cards).
                for c in connections where placed.contains(c.a) && placed.contains(c.b) {
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
            ForEach(boardMemories) { m in
                PinCard(memory: m, width: Self.cardW, height: Self.cardH,
                        beige: beige, border: beigeBorder, crimson: crimson,
                        slate: slate, bodyGrey: bodyGrey, maroon: maroon)
                    .position(positions[m.id] ?? center)
                    .onTapGesture { detail = m }
            }
            // Tappable insight markers at each string's midpoint.
            ForEach(placedConnections) { c in
                if let mid = midpoint(c) {
                    connectionTag(c).position(mid).onTapGesture { editingConn = c }
                }
            }
        }
    }

    /// Connections whose both endpoints are currently on the board.
    private var placedConnections: [BoardConnection] {
        connections.filter { placed.contains($0.a) && placed.contains($0.b) }
    }

    private func midpoint(_ c: BoardConnection) -> CGPoint? {
        guard let pa = anchor(c.a), let pb = anchor(c.b) else { return nil }
        return CGPoint(x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2)
    }

    /// The small dot (and note, if any) shown on a string; tap to edit.
    @ViewBuilder
    private func connectionTag(_ c: BoardConnection) -> some View {
        VStack(spacing: 3) {
            Circle().fill(crimson).frame(width: 11, height: 11)
                .overlay(Circle().stroke(.white, lineWidth: 1.5))
                .shadow(color: .black.opacity(0.2), radius: 1, y: 0.5)
            if !c.insight.isEmpty {
                Text(c.insight)
                    .font(.system(size: 10, design: .serif)).foregroundStyle(maroon)
                    .lineLimit(2).multilineTextAlignment(.center)
                    .padding(.horizontal, 6).padding(.vertical, 3)
                    .background(beige).clipShape(RoundedRectangle(cornerRadius: 4))
                    .overlay(RoundedRectangle(cornerRadius: 4).stroke(beigeBorder, lineWidth: 0.75))
                    .frame(maxWidth: 120)
            }
        }
        .frame(width: 130, height: 44)          // generous tap target
        .contentShape(Rectangle())
    }

    private func memoryTitle(_ id: String) -> String {
        let m = memories.first { $0.id == id }
        let t = m?.title.isEmpty == false ? m!.title : (m?.content ?? "")
        return t.isEmpty ? "(untitled)" : t
    }

    private func setInsight(_ c: BoardConnection, _ text: String) {
        guard let i = connections.firstIndex(where: { $0.id == c.id }) else { return }
        recordUndo()
        connections[i].insight = text.trimmingCharacters(in: .whitespacesAndNewlines)
        persistAll()
    }

    private func deleteConnection(_ c: BoardConnection) {
        guard let i = connections.firstIndex(where: { $0.id == c.id }) else { return }
        recordUndo()
        connections.remove(at: i)
        persistAll()
    }

    // MARK: layout (deterministic scattered grid — looks hand-pinned)

    private var center: CGPoint {
        let s = Self.canvasSize(placed.count); return CGPoint(x: s.width / 2, y: s.height / 2)
    }

    static let placeCols = 4
    /// The middle of the (floor-size) canvas — new cards cluster here and the
    /// board opens scrolled to this point.
    static let boardCenter = CGPoint(x: 1100, y: 1600)

    /// A scattered grid slot for the i-th placed card, centered on the board so
    /// added cards land in the middle (fixed columns so a slot doesn't shift as
    /// more are added).
    static func slot(_ i: Int) -> CGPoint {
        let col = i % placeCols, row = i / placeCols
        let originX = boardCenter.x - CGFloat(placeCols - 1) * colW / 2
        let originY = boardCenter.y - rowH / 2
        let jx = CGFloat((i &* 73) % 49) - 24
        let jy = CGFloat((i &* 37) % 41) - 20
        return CGPoint(x: originX + CGFloat(col) * colW + jx,
                       y: originY + CGFloat(row) * rowH + jy)
    }

    /// A big board so cards and string have room to roam — no "wall" at the edge.
    static func canvasSize(_ count: Int) -> CGSize {
        let rows = Int(ceil(Double(max(1, count)) / Double(placeCols)))
        let gridW = margin * 2 + CGFloat(placeCols) * colW
        let gridH = margin * 2 + CGFloat(max(1, rows)) * rowH
        return CGSize(width: max(2200, gridW + 900),
                      height: max(3200, gridH + 1600))
    }

    /// The pin's anchor point on a card (top-right, where the push-pin sits).
    private func anchor(_ id: String) -> CGPoint? {
        guard let c = positions[id] else { return nil }
        return CGPoint(x: c.x + Self.cardW / 2 - 10, y: c.y - Self.cardH / 2 + 9)
    }

    /// Placed cards sharing a hashtag, chained — returns the two pin anchor points.
    private var stringPairs: [(CGPoint, CGPoint)] {
        var byTag: [String: [String]] = [:]
        for m in boardMemories { for t in m.hashtags { byTag[t, default: []].append(m.id) } }
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

/// A scroll view that, on its first real layout, jumps its content offset so a
/// target content point sits in the middle of the viewport (so the board opens
/// centered rather than at the top-left).
private final class CenteringScrollView: UIScrollView {
    var centerTarget: CGPoint?
    private var didCenter = false

    override func layoutSubviews() {
        super.layoutSubviews()
        guard !didCenter, bounds.width > 0, contentSize.width > 0 else { return }
        let t = centerTarget ?? CGPoint(x: contentSize.width / 2, y: contentSize.height / 2)
        let x = max(0, min(t.x - bounds.width / 2, contentSize.width - bounds.width))
        let y = max(0, min(t.y - bounds.height / 2, contentSize.height - bounds.height))
        setContentOffset(CGPoint(x: x, y: y), animated: false)
        didCenter = true
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
    let initialCenter: CGPoint
    let onConnect: (String, String) -> Void
    let onCardMoveBegan: () -> Void
    let onCardMoved: () -> Void
    @ViewBuilder var content: () -> Content

    func makeUIView(context: Context) -> UIScrollView {
        let scroll = CenteringScrollView()
        scroll.centerTarget = initialCenter
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
                    parent.onCardMoveBegan()   // snapshot pre-drag state for undo
                }
            case .changed:
                guard let id = dragId else { return }
                let t = g.translation(in: host.view)
                parent.positions[id] = CGPoint(x: dragStart.x + t.x, y: dragStart.y + t.y)
            case .ended, .cancelled:
                if dragId != nil { parent.onCardMoved() }   // persist the new arrangement
                dragId = nil
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

/// A searchable, multi-select list of memories not yet on the board. Tap to
/// select, then "Add" pins them all to the canvas.
private struct BoardAddSheet: View {
    @Environment(\.dismiss) private var dismiss
    let memories: [XIMemory]                 // off-board, available to add
    var onAdd: ([String]) -> Void

    @State private var search = ""
    @State private var selected: Set<String> = []

    private var filtered: [XIMemory] {
        let q = search.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return memories }
        return memories.filter {
            ($0.title + " " + $0.content + " " + $0.hashtags.joined(separator: " "))
                .lowercased().contains(q)
        }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass").foregroundStyle(XITheme.line)
                    TextField("search memories", text: $search)
                        .font(.system(.body, design: .serif)).autocorrectionDisabled()
                }
                .padding(10).background(XITheme.white)
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(XITheme.line.opacity(0.6)))
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .padding(.horizontal, 14).padding(.vertical, 10)

                if memories.isEmpty {
                    Spacer()
                    Text("Every memory is already on the board.")
                        .font(.system(.subheadline, design: .serif)).foregroundStyle(XITheme.line)
                        .multilineTextAlignment(.center).padding(24)
                    Spacer()
                } else {
                    ScrollView {
                        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12),
                                            GridItem(.flexible(), spacing: 12)],
                                  alignment: .leading, spacing: 12) {
                            ForEach(filtered) { m in card(m) }
                        }
                        .padding(14)
                    }
                    .scrollDismissesKeyboard(.immediately)
                }
            }
            .background(XITheme.paper.ignoresSafeArea())
            .navigationTitle("add to board")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("cancel") { dismiss() }.font(.system(.body, design: .serif)).tint(XITheme.line)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Add\(selected.isEmpty ? "" : " (\(selected.count))")") {
                        onAdd(Array(selected)); dismiss()
                    }
                    .font(.system(.body, design: .serif).weight(.semibold))
                    .tint(XITheme.gold).disabled(selected.isEmpty)
                }
            }
        }
    }

    /// One selectable memory card — matches the archive card look.
    private func card(_ m: XIMemory) -> some View {
        let on = selected.contains(m.id)
        return VStack(alignment: .leading, spacing: 8) {
            if !m.title.isEmpty {
                Text(m.title)
                    .font(.system(.subheadline, design: .serif).weight(.medium))
                    .foregroundStyle(XITheme.archiveTitle).lineLimit(3)
            }
            if !m.content.isEmpty {
                Text(m.content)
                    .font(.system(.footnote, design: .serif)).foregroundStyle(XITheme.archiveBody)
                    .lineLimit(6).fixedSize(horizontal: false, vertical: true)
            }
            if !m.hashtags.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(m.hashtags.prefix(3), id: \.self) { tag in
                        Text(tag).font(.system(size: 11, design: .serif)).foregroundStyle(XITheme.gold)
                            .padding(.vertical, 3).padding(.horizontal, 8)
                            .background(XITheme.gold.opacity(0.08)).clipShape(Capsule())
                    }
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 96, alignment: .leading)
        .background(on ? XITheme.gold.opacity(0.10) : XITheme.archiveCard)
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(on ? XITheme.gold : XITheme.archiveBorder, lineWidth: on ? 2 : 1))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(alignment: .topTrailing) {
            Image(systemName: on ? "checkmark.circle.fill" : "circle")
                .foregroundStyle(on ? XITheme.gold : XITheme.line)
                .padding(8).background(.white.opacity(0.6)).clipShape(Circle()).padding(6)
        }
        .contentShape(Rectangle())
        .onTapGesture { toggle(m.id) }
    }

    private func toggle(_ id: String) {
        if selected.contains(id) { selected.remove(id) } else { selected.insert(id) }
    }
}

/// Editor for a string's insight — the two connected memories, a note field for
/// "what connects them", and a remove-connection action.
private struct ConnectionInsightSheet: View {
    @Environment(\.dismiss) private var dismiss
    let titleA: String
    let titleB: String
    let insight: String
    var onSave: (String) -> Void
    var onDelete: () -> Void

    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    HStack(alignment: .center, spacing: 10) {
                        pill(titleA)
                        Image(systemName: "link").foregroundStyle(XITheme.maroon)
                        pill(titleB)
                    }
                    Text("What connects them?")
                        .font(.system(.subheadline, design: .serif).weight(.medium))
                        .foregroundStyle(XITheme.ink)
                    TextEditor(text: $text)
                        .font(.system(.body, design: .serif)).foregroundStyle(XITheme.ink)
                        .frame(minHeight: 120)
                        .scrollContentBackground(.hidden)
                        .padding(8).background(XITheme.white)
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(XITheme.line.opacity(0.6)))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .focused($focused)
                    Button(role: .destructive) { onDelete(); dismiss() } label: {
                        Label("Remove connection", systemImage: "scissors")
                            .font(.system(.body, design: .serif))
                    }.tint(XITheme.maroon)
                    Spacer()
                }
                .padding(20)
            }
            .background(XITheme.paper.ignoresSafeArea())
            .navigationTitle("connection")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("cancel") { dismiss() }.font(.system(.body, design: .serif)).tint(XITheme.line)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("save") { onSave(text); dismiss() }
                        .font(.system(.body, design: .serif).weight(.semibold)).tint(XITheme.gold)
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer(); Button("Done") { focused = false }.tint(XITheme.gold)
                }
            }
            .onAppear { text = insight }
        }
    }

    private func pill(_ s: String) -> some View {
        Text(s)
            .font(.system(.footnote, design: .serif)).foregroundStyle(XITheme.archiveTitle)
            .lineLimit(3).padding(10).frame(maxWidth: .infinity)
            .background(XITheme.archiveCard)
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(XITheme.archiveBorder))
            .clipShape(RoundedRectangle(cornerRadius: 6))
    }
}

/// Wraps a shareable board link so it can drive an item-sheet.
struct ShareInfo: Identifiable { let id = UUID(); let url: URL }

/// Confirmation sheet after publishing a board — shows the link, a system share
/// button, and copy. Anyone with the link can open the board on the web.
private struct BoardShareSheet: View {
    @Environment(\.dismiss) private var dismiss
    let url: URL
    @State private var copied = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Image(systemName: "link.circle.fill")
                    .font(.system(size: 46)).foregroundStyle(XITheme.gold)
                Text("Your board is shared")
                    .font(.system(.title3, design: .serif).weight(.semibold)).foregroundStyle(XITheme.ink)
                Text("Anyone with this link can open your board on the web.")
                    .font(.system(.subheadline, design: .serif)).foregroundStyle(XITheme.line)
                    .multilineTextAlignment(.center)

                Text(url.absoluteString)
                    .font(.system(.footnote, design: .monospaced)).foregroundStyle(XITheme.ink)
                    .lineLimit(2).truncationMode(.middle)
                    .padding(12).frame(maxWidth: .infinity)
                    .background(XITheme.white)
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(XITheme.line.opacity(0.6)))
                    .clipShape(RoundedRectangle(cornerRadius: 8))

                HStack(spacing: 12) {
                    Button {
                        UIPasteboard.general.string = url.absoluteString
                        copied = true
                    } label: {
                        Label(copied ? "Copied" : "Copy", systemImage: copied ? "checkmark" : "doc.on.doc")
                            .font(.system(.body, design: .serif)).frame(maxWidth: .infinity)
                            .padding(.vertical, 11)
                            .overlay(RoundedRectangle(cornerRadius: 6).stroke(XITheme.gold, lineWidth: 1))
                    }.tint(XITheme.gold)

                    ShareLink(item: url) {
                        Label("Share", systemImage: "square.and.arrow.up")
                            .font(.system(.body, design: .serif).weight(.semibold))
                            .foregroundStyle(.white).frame(maxWidth: .infinity)
                            .padding(.vertical, 11).background(XITheme.gold)
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                    }
                }
                Spacer()
            }
            .padding(24)
            .background(XITheme.paper.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("done") { dismiss() }.font(.system(.body, design: .serif)).tint(XITheme.gold)
                }
            }
        }
    }
}
