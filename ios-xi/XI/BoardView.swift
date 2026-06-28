import SwiftUI

/// A pairing of two orthogonally-adjacent board cards (always one event + one twist).
struct Pairing: Identifiable {
    let event: XICard
    let twist: XICard
    var id: String { "\(event.id)__\(twist.id)" }
}

struct BoardView: View {
    @ObservedObject var auth: AuthState

    @State private var viewDay = BoardEngine.dayNumber()
    @State private var selected: Cell?
    @State private var composing: Pairing?

    private struct Cell: Equatable { let r: Int; let c: Int }

    private var today: Int { BoardEngine.dayNumber() }
    private var isToday: Bool { viewDay == today }
    private var placed: [Placed] { BoardEngine.dailyBoard(viewDay) }
    private var byCell: [String: Placed] {
        Dictionary(uniqueKeysWithValues: placed.map { ("\($0.r),\($0.c)", $0) })
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                header
                board
                Text(isToday
                     ? "Tap two touching cards to tell that story."
                     : "Past board — view only. Tap › to come back to today.")
                    .font(.system(.footnote, design: .serif))
                    .foregroundStyle(XITheme.line)
                    .multilineTextAlignment(.center)
                    .padding(.top, 4)
                Spacer()
            }
            .padding(16)
            .frame(maxWidth: 520)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .background(XITheme.paper.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        if let email = auth.email {
                            Text(email)
                        } else if auth.isAnonymous {
                            Text("playing without an account")
                        }
                        Button("sign out", role: .destructive) { try? XIService.shared.signOut() }
                    } label: {
                        Image(systemName: "person.circle").tint(XITheme.maroon)
                    }
                }
            }
            .sheet(item: $composing) { pair in
                ComposerSheet(pairing: pair, boardDay: viewDay)
            }
        }
        .tint(XITheme.maroon)
    }

    private var header: some View {
        HStack {
            Button { viewDay -= 1; selected = nil } label: { Image(systemName: "chevron.left") }
            Spacer()
            VStack(spacing: 2) {
                Text("XI")
                    .font(.system(.title2, design: .serif).weight(.semibold)).tracking(6)
                    .foregroundStyle(XITheme.ink)
                Text(BoardEngine.dayLabel(viewDay, today: today))
                    .font(.system(.subheadline, design: .serif)).foregroundStyle(XITheme.maroon)
            }
            Spacer()
            Button { if viewDay < today { viewDay += 1; selected = nil } } label: { Image(systemName: "chevron.right") }
                .disabled(viewDay >= today)
        }
        .font(.system(.title3, design: .serif))
        .tint(XITheme.maroon)
        .padding(.horizontal, 4)
    }

    private var board: some View {
        VStack(spacing: 5) {
            ForEach(0..<5, id: \.self) { r in
                HStack(spacing: 5) {
                    ForEach(0..<5, id: \.self) { c in
                        cell(r, c)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func cell(_ r: Int, _ c: Int) -> some View {
        if let p = byCell["\(r),\(c)"] {
            let isEvent = p.d == "be"
            let card = isEvent ? XIDeck.events[p.i] : XIDeck.twists[p.i]
            CardCell(card: card, isEvent: isEvent, selected: selected == Cell(r: r, c: c))
                .onTapGesture { tap(r, c, card: card, isEvent: isEvent) }
        } else {
            RoundedRectangle(cornerRadius: 4)
                .fill(Color.black.opacity(0.025))
                .aspectRatio(1, contentMode: .fit)
        }
    }

    private func tap(_ r: Int, _ c: Int, card: XICard, isEvent: Bool) {
        guard isToday else { return } // past boards are read-only
        let here = Cell(r: r, c: c)
        guard let sel = selected else { selected = here; return }
        if sel == here { selected = nil; return }

        let adjacent = abs(sel.r - r) + abs(sel.c - c) == 1
        guard adjacent, let other = byCell["\(sel.r),\(sel.c)"] else { selected = here; return }

        let otherIsEvent = other.d == "be"
        let otherCard = otherIsEvent ? XIDeck.events[other.i] : XIDeck.twists[other.i]
        let (ev, tw) = otherIsEvent ? (otherCard, card) : (card, otherCard)
        composing = Pairing(event: ev, twist: tw)
        selected = nil
    }
}

struct CardCell: View {
    let card: XICard
    let isEvent: Bool
    let selected: Bool

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 4).fill(isEvent ? XITheme.cream : XITheme.white)
            if let img = card.img, let url = URL(string: XITheme.cardArtBase + img) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFit()
                } placeholder: {
                    Color.clear
                }
                .padding(1)
            } else {
                Text(card.cap)
                    .font(.system(size: 9, design: .serif))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(XITheme.ink)
                    .padding(2)
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .overlay(
            RoundedRectangle(cornerRadius: 4)
                .stroke(selected ? XITheme.maroon : XITheme.line, lineWidth: selected ? 2.5 : 0.5)
        )
    }
}
