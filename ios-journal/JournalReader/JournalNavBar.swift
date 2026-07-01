import SwiftUI

/// The five bottom-nav destinations. `.record` is the emphasized center button
/// (a raised pink +); `.more` is a reserved slot we haven't decided on yet.
enum JournalTab: Int, CaseIterable, Identifiable {
    case dreams, journal, record, stickers, more
    var id: Int { rawValue }
}

/// Shared bottom nav for the Journal app: Dreams · Journal · ＋ · Stickers · (soon).
/// White bar, hairline top, pink accent when active — matches the app's look.
struct JournalNavBar: View {
    @Binding var selection: JournalTab

    private let accent = Color(red: 1.0, green: 0.7, blue: 0.8)   // pastel pink
    private let inactive = Color(white: 0.6)

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            item(.dreams,   symbol: "cloud",           filled: "cloud.fill",           label: "Dreams")
            item(.journal,  symbol: "book.closed",     filled: "book.closed.fill",     label: "Journal")
            recordButton
            item(.stickers, symbol: "square.grid.2x2", filled: "square.grid.2x2.fill", label: "Stickers")
            placeholder
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

    /// Reserved fifth slot — dimmed until we decide what goes here.
    private var placeholder: some View {
        Button { selection = .more } label: {
            VStack(spacing: 3) {
                Image(systemName: "circle.dashed")
                    .font(.system(size: 20))
                    .frame(height: 24)
                Text("Soon")
                    .font(.system(size: 10)).tracking(0.2)
            }
            .foregroundStyle(inactive.opacity(0.55))
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
    }
}
