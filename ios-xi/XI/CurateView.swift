import SwiftUI

/// Curate — the deck editor. Checkboxes at the top toggle whole decks in/out of
/// play (plus the "loved" hearts-deck switch); below, every card has ♥ (love)
/// and ✕ (remove) toggles, grouped by deck like the web's `renderCurate()`.
/// Interchangeable cards (shown once) toggle both their event and twist roles
/// together; split-deck cards toggle only their own role. All removals and
/// disabled decks are skipped when dealing Today, the Board of the Day, and
/// new Versus games.
struct CurateView: View {
    @ObservedObject private var curate = CurateStore.shared

    private let lovedRed = Color(red: 0.753, green: 0.224, blue: 0.169) // #c0392b
    private let cols = [GridItem(.flexible(), spacing: 10),
                        GridItem(.flexible(), spacing: 10),
                        GridItem(.flexible(), spacing: 10)]

    /// Cards of each deck, in pool order (events pool carries every deck's
    /// cards; split decks also have their twists list).
    private var eventsByDeck: [String: [XICard]] {
        Dictionary(grouping: XIDeck.events, by: { $0.deck ?? "" })
    }
    private var twistsByDeck: [String: [XICard]] {
        Dictionary(grouping: XIDeck.twists, by: { $0.deck ?? "" })
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                XILogo(height: 32)
                    .frame(maxWidth: .infinity, alignment: .leading).padding(.bottom, 6)
                Text("Heart the cards you love, remove the ones you don't. Your curation shapes the whole app — the daily cards, the Board of the Day, redraws, and new Versus games all draw from the decks you keep.")
                    .font(.system(size: 13, design: .serif)).foregroundStyle(XITheme.line)
                    .padding(.bottom, 14)

                deckToggles
                    .padding(.bottom, 20)

                let lovedCards = curate.lovedCards
                if curate.lovedOn && !lovedCards.isEmpty {
                    deckSection("loved", tag: "your hearts deck", cards: lovedCards)
                }
                ForEach(CurateStore.decks) { deck in
                    if curate.isDeckOn(deck.id) {   // off decks: cards are hidden, not dimmed
                        if deck.split {
                            splitSection(deck)
                        } else {
                            deckSection(deck.nick, tag: nil, cards: eventsByDeck[deck.id] ?? [])
                        }
                    }
                }
            }
            .padding(.horizontal, 16).padding(.top, 18)
            .frame(maxWidth: 560).frame(maxWidth: .infinity)
        }
        .background(XITheme.paper.ignoresSafeArea())
    }

    // MARK: Deck checkboxes

    private var deckToggles: some View {
        let lovedCount = curate.lovedCards.count
        return LazyVGrid(columns: [GridItem(.adaptive(minimum: 104), spacing: 6, alignment: .leading)],
                         alignment: .leading, spacing: 8) {
            ForEach(CurateStore.decks) { deck in
                deckToggle(nick: deck.nick, on: curate.isDeckOn(deck.id), heart: false) {
                    curate.toggleDeck(deck.id)
                }
            }
            deckToggle(nick: lovedCount > 0 ? "loved (\(lovedCount))" : "loved",
                       on: curate.lovedOn, heart: true) {
                curate.toggleLovedDeck()
            }
        }
    }

    private func deckToggle(nick: String, on: Bool, heart: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                ZStack {
                    RoundedRectangle(cornerRadius: 3)
                        .stroke(on ? XITheme.gold : XITheme.line, lineWidth: 1)
                        .background(RoundedRectangle(cornerRadius: 3).fill(XITheme.white))
                    if on {
                        if heart {
                            Image(systemName: "heart.fill")
                                .font(.system(size: 8)).foregroundStyle(lovedRed)
                        } else {
                            Image(systemName: "checkmark")
                                .font(.system(size: 9, weight: .bold)).foregroundStyle(XITheme.gold)
                        }
                    }
                }
                .frame(width: 15, height: 15)
                Text(nick)
                    .font(.system(size: 13, design: .serif))
                    .foregroundStyle(on ? XITheme.ink : XITheme.line)
            }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? [.isSelected] : [])
    }

    // MARK: Card groups

    private func deckSection(_ title: String, tag: String?, cards: [XICard]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader(title, tag: tag)
            grid(cards)
        }
        .padding(.bottom, 28)
    }

    /// Split decks (claude / chatgpt) have real, separate event and twist lists.
    private func splitSection(_ deck: XIDeckDef) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader(deck.nick, tag: "events + twists")
            subLabel("events")
            grid(eventsByDeck[deck.id] ?? [])
            subLabel("twists")
            grid(twistsByDeck[deck.id] ?? [])
        }
        .padding(.bottom, 28)
    }

    private func sectionHeader(_ title: String, tag: String?) -> some View {
        HStack(spacing: 8) {
            Text(title)
                .font(.system(size: 16, design: .serif)).tracking(0.8)
                .foregroundStyle(XITheme.gold)
            if let tag {
                Text(tag)
                    .font(.system(size: 11, design: .serif)).italic()
                    .foregroundStyle(XITheme.line)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.bottom, 6)
        .overlay(Rectangle().fill(XITheme.line).frame(height: 0.5), alignment: .bottom)
    }

    private func subLabel(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 12, design: .serif))
            .foregroundStyle(XITheme.line)
    }

    private func grid(_ cards: [XICard]) -> some View {
        LazyVGrid(columns: cols, spacing: 10) {
            ForEach(cards) { card in
                CurCard(card: card,
                        loved: curate.isLoved(card.id), off: curate.isExcluded(card.id),
                        onLove: { curate.toggleLoved(card.id) },
                        onRemove: { curate.toggleExcluded(card.id) })
            }
        }
    }
}

/// One curate tile: the card art with circular ♥ and ✕ toggles.
private struct CurCard: View {
    let card: XICard
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
                           bg: off ? XITheme.gold : Color.white.opacity(0.92),
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
        CardArt(card: card, capSize: 10, pad: 6)
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
