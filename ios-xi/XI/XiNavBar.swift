import SwiftUI

/// The five XI destinations, matching the web `XiNavBar`.
enum XiTab: String, CaseIterable, Identifiable {
    case today, curate, daily, versus, library
    var id: String { rawValue }
    var label: String {
        switch self {
        case .today: return "Today"
        case .curate: return "Curate"
        case .daily: return "Daily"
        case .versus: return "Versus"
        case .library: return "Library"
        }
    }
}

/// Shared bottom nav rendered on every XI screen — a faithful port of the web
/// `XiNavBar` (serif labels, muted taupe, maroon when active, hairline top).
struct XiNavBar: View {
    @Binding var selection: XiTab

    var body: some View {
        HStack(alignment: .bottom, spacing: 0) {
            ForEach(XiTab.allCases) { tab in
                Button { selection = tab } label: { item(tab) }
                    .buttonStyle(.plain)
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(.top, 7)
        .padding(.horizontal, 2)
        .background(
            XITheme.navBg
                .overlay(Rectangle().fill(XITheme.navBorder).frame(height: 0.5), alignment: .top)
                .ignoresSafeArea(.container, edges: .bottom)
        )
    }

    private func item(_ tab: XiTab) -> some View {
        let on = selection == tab
        return VStack(spacing: 3) {
            XiNavIcon(tab: tab)
                .stroke(style: StrokeStyle(lineWidth: 1.7, lineCap: .round, lineJoin: .round))
                .frame(width: 23, height: 23)
            Text(tab.label.lowercased())
                .font(.system(size: 9.5, design: .serif))
                .tracking(0.2)
        }
        .foregroundStyle(on ? XITheme.maroon : XITheme.navInk)
    }
}

/// The web's inline 24×24 stroke icons, redrawn as SwiftUI shapes so the nav
/// matches pixel-for-pixel (calendar, heart, calendar-grid, ▶◀, shelved books).
struct XiNavIcon: Shape {
    let tab: XiTab

    func path(in rect: CGRect) -> Path {
        // Build in the SVG's 24×24 space, then scale into `rect`.
        var p = Path()
        switch tab {
        case .today:
            p.addRoundedRect(in: CGRect(x: 3, y: 4, width: 18, height: 18), cornerSize: CGSize(width: 2, height: 2))
            p.move(to: CGPoint(x: 16, y: 2)); p.addLine(to: CGPoint(x: 16, y: 6))
            p.move(to: CGPoint(x: 8, y: 2)); p.addLine(to: CGPoint(x: 8, y: 6))
            p.move(to: CGPoint(x: 3, y: 10)); p.addLine(to: CGPoint(x: 21, y: 10))
        case .curate:
            // Heart: tip at bottom, two lobes meeting in a center notch.
            p.move(to: CGPoint(x: 12, y: 21))
            p.addCurve(to: CGPoint(x: 12, y: 8.5),
                       control1: CGPoint(x: 3, y: 16), control2: CGPoint(x: 3, y: 7))
            p.addCurve(to: CGPoint(x: 12, y: 21),
                       control1: CGPoint(x: 21, y: 7), control2: CGPoint(x: 21, y: 16))
            p.closeSubpath()
        case .daily:
            p.addRoundedRect(in: CGRect(x: 3, y: 4, width: 18, height: 17), cornerSize: CGSize(width: 2, height: 2))
            p.move(to: CGPoint(x: 16, y: 2)); p.addLine(to: CGPoint(x: 16, y: 6))
            p.move(to: CGPoint(x: 8, y: 2)); p.addLine(to: CGPoint(x: 8, y: 6))
            p.move(to: CGPoint(x: 3, y: 10)); p.addLine(to: CGPoint(x: 21, y: 10))
            p.move(to: CGPoint(x: 3, y: 15)); p.addLine(to: CGPoint(x: 21, y: 15))
            p.move(to: CGPoint(x: 9, y: 10)); p.addLine(to: CGPoint(x: 9, y: 21))
            p.move(to: CGPoint(x: 15, y: 10)); p.addLine(to: CGPoint(x: 15, y: 21))
        case .versus:
            p.move(to: CGPoint(x: 3, y: 6)); p.addLine(to: CGPoint(x: 10, y: 12))
            p.addLine(to: CGPoint(x: 3, y: 18)); p.closeSubpath()
            p.move(to: CGPoint(x: 21, y: 6)); p.addLine(to: CGPoint(x: 14, y: 12))
            p.addLine(to: CGPoint(x: 21, y: 18)); p.closeSubpath()
        case .library:
            p.move(to: CGPoint(x: 16, y: 6)); p.addLine(to: CGPoint(x: 20, y: 20))
            p.move(to: CGPoint(x: 12, y: 6)); p.addLine(to: CGPoint(x: 12, y: 20))
            p.move(to: CGPoint(x: 8, y: 8)); p.addLine(to: CGPoint(x: 8, y: 20))
            p.move(to: CGPoint(x: 4, y: 4)); p.addLine(to: CGPoint(x: 4, y: 20))
        }
        let s = min(rect.width, rect.height) / 24.0
        return p.applying(CGAffineTransform(scaleX: s, y: s))
    }
}
