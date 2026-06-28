import SwiftUI

/// Curate — the deck editor. A grid of every event and twist card, each with a
/// ♥ (love) and ✕ (remove) toggle. Removed cards are skipped when Today deals a
/// pairing; hearts mark favourites. Mirrors the web `renderCurate()` per-card
/// controls (the web's whole-deck on/off toggles don't apply here — the native
/// app ships a single board deck).
struct CurateView: View {
    @ObservedObject private var curate = CurateStore.shared

    private let lovedRed = Color(red: 0.753, green: 0.224, blue: 0.169) // #c0392b
    private let cols = [GridItem(.flexible(), spacing: 10),
                        GridItem(.flexible(), spacing: 10),
                        GridItem(.flexible(), spacing: 10)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text("XI")
                    .font(.system(.title2, design: .serif).weight(.semibold)).tracking(6)
                    .foregroundStyle(XITheme.ink).padding(.bottom, 6)
                Text("Heart the cards you love, remove the ones you don't. Removed cards stop showing up on Today.")
                    .font(.system(size: 13, design: .serif)).foregroundStyle(XITheme.line)
                    .padding(.bottom, 20)

                section("events", XIDeck.events, isEvent: true)
                section("twists", XIDeck.twists, isEvent: false)
            }
            .padding(.horizontal, 16).padding(.top, 18)
            .frame(maxWidth: 560).frame(maxWidth: .infinity)
        }
        .background(XITheme.paper.ignoresSafeArea())
    }

    private func section(_ title: String, _ cards: [XICard], isEvent: Bool) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.system(size: 16, design: .serif)).tracking(0.8)
                .foregroundStyle(XITheme.maroon)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.bottom, 6)
                .overlay(Rectangle().fill(XITheme.line).frame(height: 0.5), alignment: .bottom)
            LazyVGrid(columns: cols, spacing: 10) {
                ForEach(cards) { card in
                    CurCard(card: card, isEvent: isEvent,
                            loved: curate.isLoved(card.id), off: curate.isExcluded(card.id),
                            onLove: { curate.toggleLoved(card.id) },
                            onRemove: { curate.toggleExcluded(card.id) })
                }
            }
        }
        .padding(.bottom, 28)
    }
}

/// One curate tile: the card art with circular ♥ and ✕ toggles.
private struct CurCard: View {
    let card: XICard
    let isEvent: Bool
    let loved: Bool
    let off: Bool
    var onLove: () -> Void
    var onRemove: () -> Void

    private let lovedRed = Color(red: 0.753, green: 0.224, blue: 0.169)

    var body: some View {
        ZStack {
            art
            VStack {
                HStack {
                    toggle(system: loved ? "heart.fill" : "heart",
                           fg: loved ? .white : lovedRed,
                           bg: loved ? lovedRed : Color.white.opacity(0.92),
                           action: onLove)
                    Spacer()
                    toggle(system: off ? "plus" : "xmark",
                           fg: off ? Color(red: 0.992, green: 0.969, blue: 0.925) : XITheme.ink,
                           bg: off ? XITheme.maroon : Color.white.opacity(0.92),
                           action: onRemove)
                }
                Spacer()
            }
            .padding(4)
        }
        .aspectRatio(1, contentMode: .fit)
        .background(XITheme.white)
        .clipShape(RoundedRectangle(cornerRadius: 4))
        .overlay(RoundedRectangle(cornerRadius: 4)
            .stroke(loved ? lovedRed : XITheme.line, lineWidth: loved ? 1.5 : 0.5))
    }

    private var art: some View {
        Group {
            if let img = card.img, let url = URL(string: XITheme.cardArtBase + img) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFit().blendMode(.multiply)
                } placeholder: { Color.clear }
                .padding(6)
            } else {
                Text(card.cap)
                    .font(.system(size: 10, design: .serif)).multilineTextAlignment(.center)
                    .foregroundStyle(XITheme.ink).padding(6)
            }
        }
        .opacity(off ? 0.32 : 1)
    }

    private func toggle(system: String, fg: Color, bg: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: system)
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(fg)
                .frame(width: 22, height: 22)
                .background(bg)
                .clipShape(Circle())
                .overlay(Circle().stroke(XITheme.line.opacity(0.5), lineWidth: 0.5))
                .shadow(color: .black.opacity(0.12), radius: 1, y: 0.5)
        }
        .buttonStyle(.plain)
    }
}
