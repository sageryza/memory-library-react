import SwiftUI

/// "Past cards" — the last 24 days of the deterministic daily pairing, as mini
/// event+twist thumbnails with their date. Tap any two cards across the grid to
/// pair them, then "use these" jumps back to Today's composer with that pairing.
/// Mirrors the web `renderGallery()`.
struct GalleryView: View {
    @Environment(\.dismiss) private var dismiss
    /// Called with the chosen (event, twist) when the user taps "use these".
    var onUse: (XICard, XICard) -> Void

    private let gold = Color(red: 0.788, green: 0.635, blue: 0.153) // #c9a227

    @State private var selected: [Ref] = []

    private struct Ref: Equatable { let day: Int; let isEvent: Bool; let card: XICard
        static func == (a: Ref, b: Ref) -> Bool { a.day == b.day && a.isEvent == b.isEvent } }

    private let cols = [GridItem(.flexible(), spacing: 14), GridItem(.flexible(), spacing: 14)]
    private var days: [Int] { (0..<24).map { BoardEngine.dayNumber() - $0 } }

    var body: some View {
        NavigationStack {
            ScrollView {
                selBar
                LazyVGrid(columns: cols, spacing: 16) {
                    ForEach(days, id: \.self) { day in cell(day) }
                }
                .padding(.horizontal, 16).padding(.bottom, 24)
            }
            .background(XITheme.paper.ignoresSafeArea())
            .navigationTitle("past cards")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("done") { dismiss() }.font(.system(.body, design: .serif)).tint(XITheme.maroon)
                }
            }
        }
    }

    private var selBar: some View {
        Group {
            if selected.count == 2 {
                Button { useSelection() } label: {
                    Text("Add a memory with these →")
                        .font(.system(size: 15, design: .serif)).tracking(0.5).foregroundStyle(XITheme.paper)
                        .padding(.vertical, 8).padding(.horizontal, 22)
                        .background(XITheme.ink).clipShape(RoundedRectangle(cornerRadius: 6))
                }
            } else {
                Text("Tap two cards to pair them.")
                    .font(.system(size: 12, design: .serif)).tracking(0.6).foregroundStyle(XITheme.line)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 8).padding(.bottom, 12)
    }

    private func cell(_ day: Int) -> some View {
        let pair = pairForDay(day)
        return VStack(spacing: 5) {
            HStack(spacing: 5) {
                mini(Ref(day: day, isEvent: true, card: pair.0))
                mini(Ref(day: day, isEvent: false, card: pair.1))
            }
            Text(BoardEngine.dayLabel(day))
                .font(.system(size: 12, design: .serif)).tracking(0.6).foregroundStyle(XITheme.ink)
        }
    }

    private func mini(_ ref: Ref) -> some View {
        let isSel = selected.contains(ref)
        return GalleryCard(card: ref.card, isEvent: ref.isEvent)
            .overlay(RoundedRectangle(cornerRadius: 2).stroke(isSel ? gold : XITheme.line,
                                                              lineWidth: isSel ? 2 : 0.5))
            .onTapGesture { toggle(ref) }
    }

    private func toggle(_ ref: Ref) {
        if let i = selected.firstIndex(of: ref) { selected.remove(at: i) }
        else { selected.append(ref); if selected.count > 2 { selected.removeFirst() } }
    }

    private func useSelection() {
        guard selected.count == 2 else { return }
        let ev = selected.first(where: { $0.isEvent })?.card ?? selected[0].card
        let tw = selected.first(where: { !$0.isEvent })?.card ?? selected[1].card
        onUse(ev, tw)
        dismiss()
    }

    /// Deterministic daily pairing: event walks forward, twist backward.
    private func pairForDay(_ dn: Int) -> (XICard, XICard) {
        let ne = XIDeck.events.count, nt = XIDeck.twists.count
        let ei = ((dn % ne) + ne) % ne
        let ti = ((((nt - 1 - dn) % nt) + nt) % nt)
        return (XIDeck.events[ei], XIDeck.twists[ti])
    }
}

private struct GalleryCard: View {
    let card: XICard
    let isEvent: Bool

    var body: some View {
        ZStack {
            (isEvent ? XITheme.cream : XITheme.white)
            if let img = card.img, let url = URL(string: XITheme.cardArtBase + img) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFit().blendMode(.multiply)
                } placeholder: { Color.clear }
                .padding(4)
            } else {
                Text(card.cap).font(.system(size: 8, design: .serif)).multilineTextAlignment(.center)
                    .foregroundStyle(XITheme.ink).padding(3)
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .frame(maxWidth: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: 2))
    }
}
