import SwiftUI

/// The five XI destinations. (Curate moved into Settings — it's a rare,
/// owner-facing task, not a primary destination.)
enum XiTab: String, CaseIterable, Identifiable {
    // `daily` (Board of the Day) is RETIRED from the navigation — July 2026.
    // The case and BoardView stay so deep links and old state still resolve,
    // but it is not listed in `tabs` and nothing routes to it.
    case today, daily, versus, board, library

    /// The tabs actually shown, in order.
    static var tabs: [XiTab] { [.today, .versus, .board, .library] }
    var id: String { rawValue }
    var label: String {
        switch self {
        case .today: return "Today"
        case .daily: return "Daily"
        case .versus: return "Versus"
        case .board: return "Board"
        case .library: return "Library"
        }
    }
}

/// The bottom nav in the settled "2a" design language (design/xi-redesign):
/// a floating ink bar, icon-only — sun · overlapping circles · four squares ·
/// open book — gold for the active tab, dimmed parchment for the rest. The
/// shell gives it its 11pt margins so it floats inside Today's double frame
/// exactly like the artboard.
struct XiNavBar: View {
    @Binding var selection: XiTab

    var body: some View {
        HStack(spacing: 0) {
            ForEach(XiTab.tabs) { tab in
                let on = selection == tab
                Button { selection = tab } label: {
                    DecoNavIcon(tab: tab)
                        // The artboard strokes 1.8 (active) / 1.6 in a 24-unit
                        // viewBox rendered at 22px — scale to points.
                        .stroke(style: StrokeStyle(lineWidth: (on ? 1.8 : 1.6) * 22 / 24,
                                                   lineCap: .round, lineJoin: .round))
                        .foregroundStyle(on ? XiDeco.navGold : XiDeco.navDim)
                        .frame(width: 22, height: 22)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 11).padding(.bottom, 10)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(tab.label)
            }
        }
        .padding(.horizontal, 2)
        .background(XiDeco.ink)
    }
}

/// The four artboard nav glyphs, drawn from the design's 24×24 SVG paths so
/// they match the prototype stroke for stroke (they are not SF Symbols).
struct DecoNavIcon: Shape {
    let tab: XiTab

    func path(in rect: CGRect) -> Path {
        let s = rect.width / 24
        func pt(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: rect.minX + x * s, y: rect.minY + y * s)
        }
        var p = Path()
        switch tab {
        case .today, .daily: // sun
            p.addEllipse(in: CGRect(x: rect.minX + 8 * s, y: rect.minY + 8 * s,
                                    width: 8 * s, height: 8 * s))
            let rays: [(CGFloat, CGFloat, CGFloat, CGFloat)] = [
                (12, 2.5, 12, 5.5), (12, 18.5, 12, 21.5),
                (2.5, 12, 5.5, 12), (18.5, 12, 21.5, 12),
                (5.3, 5.3, 7.3, 7.3), (16.7, 16.7, 18.7, 18.7),
                (18.7, 5.3, 16.7, 7.3), (7.3, 16.7, 5.3, 18.7)]
            for r in rays { p.move(to: pt(r.0, r.1)); p.addLine(to: pt(r.2, r.3)) }
        case .versus: // two overlapping circles
            p.addEllipse(in: CGRect(x: rect.minX + 3.5 * s, y: rect.minY + 6.5 * s,
                                    width: 11 * s, height: 11 * s))
            p.addEllipse(in: CGRect(x: rect.minX + 9.5 * s, y: rect.minY + 6.5 * s,
                                    width: 11 * s, height: 11 * s))
        case .board: // four squares
            for (x, y): (CGFloat, CGFloat) in [(3.5, 3.5), (13.5, 3.5), (3.5, 13.5), (13.5, 13.5)] {
                p.addRect(CGRect(x: rect.minX + x * s, y: rect.minY + y * s,
                                 width: 7 * s, height: 7 * s))
            }
        case .library: // open book
            p.move(to: pt(12, 6.5))
            p.addCurve(to: pt(6, 4.5), control1: pt(10.5, 5), control2: pt(8.5, 4.5))
            p.addLine(to: pt(2.5, 4.5))
            p.addLine(to: pt(2.5, 18.5))
            p.addLine(to: pt(6, 18.5))
            p.addCurve(to: pt(12, 20.5), control1: pt(8.5, 18.5), control2: pt(10.5, 19))
            p.addCurve(to: pt(18, 18.5), control1: pt(13.5, 19), control2: pt(15.5, 18.5))
            p.addLine(to: pt(21.5, 18.5))
            p.addLine(to: pt(21.5, 4.5))
            p.addLine(to: pt(18, 4.5))
            p.addCurve(to: pt(12, 6.5), control1: pt(15.5, 4.5), control2: pt(13.5, 5))
            p.closeSubpath()
            p.move(to: pt(12, 6.5))
            p.addLine(to: pt(12, 20.5))
        }
        return p
    }
}
