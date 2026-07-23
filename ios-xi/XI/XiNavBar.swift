import SwiftUI

/// The five XI destinations. (Curate moved into Settings — it's a rare,
/// owner-facing task, not a primary destination.)
enum XiTab: String, CaseIterable, Identifiable {
    case today, daily, versus, board, library
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
    /// SF Symbol for the tab (same icon family as the Libraries books.vertical).
    var symbol: String {
        switch self {
        case .today: return "rectangle.portrait.on.rectangle.portrait"
        case .daily: return "square.grid.3x3"
        case .versus: return "person.2"
        case .board: return "sparkles"
        case .library: return "books.vertical"
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
            Image(systemName: tab.symbol)
                .font(.system(size: 23, weight: on ? .semibold : .regular))
                .frame(height: 27)
            Text(tab.label.lowercased())
                .font(.system(size: 10.5, design: .serif))
                .tracking(0.2).lineLimit(1).minimumScaleFactor(0.7)
        }
        .foregroundStyle(on ? XITheme.gold : XITheme.navInk)
    }
}
