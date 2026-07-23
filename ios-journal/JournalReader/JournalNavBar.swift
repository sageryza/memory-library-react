import SwiftUI

/// The five bottom-nav destinations. `.record` is the emphasized center button
/// (a raised pink +); `.setBuilder` is the SET-game-style "make a set of three"
/// tool (ported from ImageForge's /set). `.timeline` (leftmost) is the journal
/// timeline visualization.
enum JournalTab: Int, CaseIterable, Identifiable {
    case timeline, journal, record, towers, setBuilder, stickers
    var id: Int { rawValue }
}

/// Shared bottom nav for the Journal app: Timeline · Journal · ＋ · Stickers · Set.
/// White bar, hairline top, pink accent when active — matches the app's look.
struct JournalNavBar: View {
    @Binding var selection: JournalTab

    private let accent = Color(red: 1.0, green: 0.7, blue: 0.8)   // pastel pink
    private let inactive = Color(white: 0.6)

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            item(.timeline, symbol: "calendar.day.timeline.left", filled: "calendar.day.timeline.left", label: "Timeline")
            item(.journal,  symbol: "book.closed",     filled: "book.closed.fill",     label: "Journal")
            recordButton
            towersItem(label: "Towers")
            item(.setBuilder, symbol: "rectangle.3.group", filled: "rectangle.3.group.fill", label: "Set")
        }
        .padding(.top, 8)
        .padding(.horizontal, 4)
        .background(
            Color.white
                .overlay(Rectangle().fill(Color.gray.opacity(0.2)).frame(height: 0.5), alignment: .top)
                .ignoresSafeArea(.container, edges: .bottom)
        )
    }

    private func item(_ tab: JournalTab, symbol: String, filled: String, label: String) -> some View {
        let on = selection == tab
        return Button { selection = tab } label: {
            VStack(spacing: 3) {
                Image(systemName: on ? filled : symbol)
                    .font(.system(size: 20, weight: on ? .semibold : .regular))
                    .frame(height: 24)
                Text(label)
                    .font(.system(size: 10)).tracking(0.2)
                    .lineLimit(1).minimumScaleFactor(0.7)
            }
            .foregroundStyle(on ? accent : inactive)
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }

    /// The Towers tab — uses the custom turret glyph (no SF Symbol exists for it),
    /// stroked heavier when active, matching the weight swap the other tabs get.
    private func towersItem(label: String) -> some View {
        let on = selection == .towers
        return Button { selection = .towers } label: {
            VStack(spacing: 3) {
                TurretShape(designLineWidth: on ? 1.7 : 1.25)
                    .frame(width: 24, height: 24)
                Text(label)
                    .font(.system(size: 10)).tracking(0.2)
                    .lineLimit(1).minimumScaleFactor(0.7)
            }
            .foregroundStyle(on ? accent : inactive)
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }

    /// The center "record a note" button — a raised pink circle with a +.
    private var recordButton: some View {
        Button { selection = .record } label: {
            ZStack {
                Circle()
                    .fill(accent)
                    .frame(width: 52, height: 52)
                    .shadow(color: accent.opacity(0.45), radius: 5, y: 2)
                Image(systemName: "plus")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundStyle(.white)
            }
            .frame(maxWidth: .infinity)
            .offset(y: -8)   // lift it above the row
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Record a note")
    }
}
