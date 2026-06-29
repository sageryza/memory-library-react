import SwiftUI

/// A constellation of your memories — each memory is a star-pin, and maroon
/// "string" threads link memories that share a hashtag. Tap a star to open it.
/// First-pass iOS port of the web conspiracy/constellation board (the full
/// draggable board with axes + editable connections can come later).
struct ConstellationView: View {
    @Environment(\.dismiss) private var dismiss
    let memories: [XIMemory]

    @State private var detail: XIMemory?

    private let step: CGFloat = 50
    private let sky = Color(red: 0.10, green: 0.085, blue: 0.075)
    private let starColor = Color(red: 0.95, green: 0.86, blue: 0.55)

    /// Deterministic phyllotaxis ("sunflower") scatter so the layout is stable.
    private var placed: [(mem: XIMemory, p: CGPoint)] {
        let golden: CGFloat = 2.399963229728653
        let margin: CGFloat = 80
        var maxR: CGFloat = 0
        var raw: [(mem: XIMemory, p: CGPoint)] = []
        for (i, m) in memories.enumerated() {
            let r: CGFloat = step * sqrt(CGFloat(i))
            let t: CGFloat = CGFloat(i) * golden
            maxR = max(maxR, r)
            let x: CGFloat = r * cos(t)
            let y: CGFloat = r * sin(t)
            raw.append((mem: m, p: CGPoint(x: x, y: y)))
        }
        let c: CGFloat = max(360, maxR * 2 + margin * 2) / 2
        return raw.map { (mem: $0.mem, p: CGPoint(x: $0.p.x + c, y: $0.p.y + c)) }
    }

    private var canvasSize: CGFloat {
        let margin: CGFloat = 80
        let maxR: CGFloat = memories.isEmpty ? 0 : step * sqrt(CGFloat(memories.count - 1))
        return max(360, maxR * 2 + margin * 2)
    }

    /// Threads between memories that share a hashtag (chained in layout order).
    private var threads: [(CGPoint, CGPoint)] {
        let pts = placed
        let pos = Dictionary(pts.map { ($0.mem.id, $0.p) }, uniquingKeysWith: { a, _ in a })
        var byTag: [String: [String]] = [:]
        for (m, _) in pts { for tag in m.hashtags { byTag[tag, default: []].append(m.id) } }
        var lines: [(CGPoint, CGPoint)] = []
        var seen = Set<String>()
        for ids in byTag.values where ids.count > 1 {
            for k in 1..<ids.count {
                let a = ids[k - 1], b = ids[k]
                let key = a < b ? a + "|" + b : b + "|" + a
                if seen.contains(key) { continue }
                seen.insert(key)
                if let pa = pos[a], let pb = pos[b] { lines.append((pa, pb)) }
                if lines.count > 240 { return lines }
            }
        }
        return lines
    }

    var body: some View {
        NavigationStack {
            ScrollView([.horizontal, .vertical], showsIndicators: false) {
                ZStack {
                    Canvas { ctx, _ in
                        for (a, b) in threads {
                            var path = Path()
                            path.move(to: a); path.addLine(to: b)
                            ctx.stroke(path, with: .color(XITheme.gold.opacity(0.55)), lineWidth: 0.8)
                        }
                    }
                    .frame(width: canvasSize, height: canvasSize)

                    ForEach(placed, id: \.mem.id) { item in
                        StarPin(memory: item.mem, color: starColor) { detail = item.mem }
                            .position(item.p)
                    }
                }
                .frame(width: canvasSize, height: canvasSize)
            }
            .background(sky.ignoresSafeArea())
            .navigationTitle("constellation")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Text("\(memories.count) memories")
                        .font(.system(.caption, design: .serif)).foregroundStyle(XITheme.line)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("done") { dismiss() }.font(.system(.body, design: .serif)).tint(XITheme.gold)
                }
            }
            .sheet(item: $detail) { m in MemoryDetailSheet(memory: m) }
        }
    }
}

private struct StarPin: View {
    let memory: XIMemory
    let color: Color
    var onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 3) {
                Image(systemName: "sparkle")
                    .font(.system(size: 15)).foregroundStyle(color)
                    .shadow(color: XITheme.gold.opacity(0.7), radius: 4)
                Text(label)
                    .font(.system(size: 9, design: .serif)).foregroundStyle(.white.opacity(0.82))
                    .lineLimit(1).frame(maxWidth: 70)
            }
        }
        .buttonStyle(.plain)
    }

    private var label: String {
        let t = memory.title.isEmpty ? memory.content : memory.title
        return String(t.prefix(20))
    }
}
