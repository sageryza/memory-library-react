import SwiftUI

/// SwiftUI Color from a "#rrggbb" hex string (falls back to ink on bad input).
extension Color {
    init(xiHex hex: String?) {
        guard let hex, hex.hasPrefix("#"), hex.count == 7,
              let v = Int(hex.dropFirst(), radix: 16) else { self = XITheme.ink; return }
        self = Color(red: Double((v >> 16) & 0xff) / 255,
                     green: Double((v >> 8) & 0xff) / 255,
                     blue: Double(v & 0xff) / 255)
    }
}

/// Collects the bounds of the framed cells so ONE merged gold rectangle wraps
/// the chosen pair — same as Board of the Day's `FrameAnchorKey`.
private struct VersusFrameKey: PreferenceKey {
    static var defaultValue: [Anchor<CGRect>] = []
    static func reduce(value: inout [Anchor<CGRect>], nextValue: () -> [Anchor<CGRect>]) {
        value.append(contentsOf: nextValue())
    }
}

/// The live Versus board: join the game, draw a hand, place cards, and write the
/// stories of touching pairs. Mirrors the web `VersusGame` screen.
struct VersusGameView: View {
    let gameId: String
    @ObservedObject var auth: AuthState

    @StateObject private var store = VersusStore()
    @StateObject private var moderation = Moderation()
    @State private var selectedCard: HandCard?      // placement mode when set
    @State private var anchor: Anchor?              // first tapped cell for a story
    @State private var composing: StoryTarget?
    @State private var composedCells: [String] = [] // the pair framed while composing
    @State private var showHelp = false
    @State private var reportingStory: VersusStory?
    @State private var reported = false
    @State private var error: String?
    @State private var busy = false
    /// Opponent stories already copied into the Commons this session (so live
    /// snapshot updates don't re-add them; the service also de-dupes server-side).
    @State private var syncedStoryIds: Set<String> = []

    private var visibleStories: [VersusStory] { store.stories.filter { !moderation.isBlocked($0.byUid) } }

    private struct Anchor: Equatable { let r: Int; let c: Int }
    private struct StoryTarget: Identifiable {
        let event: VersusPlaced; let twist: VersusPlaced
        var id: String { "\(event.r),\(event.c)__\(twist.r),\(twist.c)" }
    }

    private var uid: String? { auth.uid }
    private var game: VersusGameState? { store.game }
    private var iActed: Bool { uid.map { game?.acted.contains($0) ?? false } ?? false }
    private var iPlaced: Bool { uid.map { game?.placedBy.contains($0) ?? false } ?? false }
    private var byCell: [String: VersusPlaced] {
        Dictionary(uniqueKeysWithValues: (game?.placed ?? []).map { ("\($0.r),\($0.c)", $0) })
    }
    private var legal: Set<String> {
        guard let card = selectedCard, let placed = game?.placed else { return [] }
        return Set(VersusModel.legalCells(placed, card).map { "\($0.0),\($0.1)" })
    }

    /// A simple gold shape per player (by join order) instead of a coloured dot —
    /// triangle, square, circle, diamond, …
    static func playerSymbol(_ order: Int) -> String {
        let shapes = ["triangle.fill", "square.fill", "circle.fill", "diamond.fill",
                      "pentagon.fill", "hexagon.fill"]
        return shapes[((order % shapes.count) + shapes.count) % shapes.count]
    }

    // Body is split into layered `some View` properties so each modifier chain
    // stays short — keeps the SwiftUI type-checker well under its timeout.
    var body: some View {
        decorated
            .sheet(item: $composing) { t in
                StoryComposer(gameId: gameId, event: t.event, twist: t.twist) { selectedCard = nil; anchor = nil }
            }
            .sheet(item: $reportingStory) { story in
                ReportSheet(
                    subjectLabel: "story",
                    onSubmit: { reason, details in
                        // Only claim success if the report actually landed.
                        Task {
                            do {
                                try await VersusService.shared.reportStory(
                                    gameId: gameId, story: story, reason: reason, details: details)
                                await MainActor.run { reported = true }
                            } catch {
                                await MainActor.run { self.error = "Report didn't send — \(error.localizedDescription)" }
                            }
                        }
                        reportingStory = nil
                    },
                    onCancel: { reportingStory = nil }
                )
            }
            .alert("Thanks — we'll review this.", isPresented: $reported) {
                Button("OK", role: .cancel) {}
            }
            .task(id: gameId) {
                guard let uid else { return }
                store.subscribe(gameId: gameId, uid: uid)
                do {
                    try await VersusService.shared.joinGame(gameId)
                    try await VersusService.shared.ensureHand(gameId)
                } catch { self.error = error.localizedDescription }
            }
            .onDisappear { store.unsubscribe() }
            .onChange(of: store.stories) { newStories in
                syncOpponentStoriesToCommons(newStories)
            }
            .onChange(of: composing?.id) { newID in
                if newID == nil { composedCells = [] }   // composer closed → clear the pair
            }
    }

    /// Copy other players' stories into your Commons — you're playing together, so
    /// they're friends. Your own stories go to your library (see writeStory), never
    /// here; blocked players are skipped.
    private func syncOpponentStoriesToCommons(_ stories: [VersusStory]) {
        guard let myUid = uid else { return }
        for s in stories where s.byUid != myUid && !s.byUid.isEmpty
            && !syncedStoryIds.contains(s.id) && !moderation.isBlocked(s.byUid) {
            syncedStoryIds.insert(s.id)
            let title = "times i \(s.eventCap.lowercased()), \(s.twistCap.lowercased())"
            let tags = [s.eventCap, s.twistCap].compactMap { cap -> String? in
                let x = cap.lowercased()
                    .replacingOccurrences(of: "[^a-z0-9]+", with: "-", options: .regularExpression)
                    .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
                return x.isEmpty ? nil : "#\(x)"
            }
            Task {
                await XIService.shared.addToCommons(
                    title: title, content: s.text, hashtags: tags,
                    authorName: s.byName, sourceType: "versus", sourceId: gameId)
            }
        }
    }

    private var decorated: some View {
        scroll
            .background(XITheme.paper.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                // App-wide title convention: ALL-CAPS typewriter, navInk.
                ToolbarItem(placement: .principal) {
                    Text("VERSUS")
                        .font(.system(.footnote, design: .monospaced)).foregroundStyle(XITheme.navInk)
                }
                // Plain icons, no iOS 26 glass pill behind them (same opt-out
                // as the constellation toolbar). No share button here — a
                // started game is locked to its players; inviting happens in
                // the waiting room only.
                if #available(iOS 26.0, *) {
                    ToolbarItem(placement: .topBarTrailing) {
                        // Instructions live behind the ⓘ, not on the board.
                        Button { showHelp = true } label: { Image(systemName: "info.circle") }.tint(XITheme.gold)
                            .buttonBorderShape(.roundedRectangle)
                    }
                    .sharedBackgroundVisibility(.hidden)
                } else {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { showHelp = true } label: { Image(systemName: "info.circle") }.tint(XITheme.gold)
                            .buttonBorderShape(.roundedRectangle)
                    }
                }
            }
            .sheet(isPresented: $showHelp) { VersusHelpSheet() }
            .tint(XITheme.gold)
    }

    private var scroll: some View {
        ScrollView {
            VStack(spacing: 16) {
                if store.notFound {
                    Text("Game not found.").font(.system(.body, design: .serif)).foregroundStyle(.red).padding(.top, 40)
                } else if game == nil {
                    ProgressView().tint(XITheme.gold).padding(.top, 40)
                } else if game?.isWaiting == true {
                    // Waiting room: the seeded board stays BLURRED until the
                    // game begins for everyone at once — reading the open
                    // cards early would be a head start.
                    board
                        .blur(radius: 8)
                        .allowsHitTesting(false)
                        .accessibilityHidden(true)
                    waitingPanel
                    if let error { Text(error).font(.footnote).foregroundStyle(.red).multilineTextAlignment(.center) }
                } else {
                    header
                    board
                    if let error { Text(error).font(.footnote).foregroundStyle(.red).multilineTextAlignment(.center) }
                    hand
                    controls
                    stories
                }
            }
            .padding(16)
            .frame(maxWidth: 540)
            .frame(maxWidth: .infinity)
        }
    }

    // MARK: header — whoever the game is waiting on, centered above the board:
    // you (with "it's your turn") until you've gone, then the player you're
    // waiting for ("waiting for Charlie…").

    @ViewBuilder
    private var header: some View {
        if let g = game, let uid {
            let waiting = g.players.filter { !g.acted.contains($0.uid) }
            let others = waiting.filter { $0.uid != uid }
            let focus = iActed ? others.first : g.players.first { $0.uid == uid }
            if let p = focus {
                let status = Text(iActed
                                  ? "waiting for \(others.map(\.name).joined(separator: ", "))…"
                                  : "it's your turn")
                    .font(.system(.caption, design: .serif))
                    .foregroundStyle(XITheme.line)
                // The CHIP is the exact center of the screen; the status text
                // sits to its left, balanced by a hidden copy on the right.
                HStack(spacing: 8) {
                    status
                    HStack(spacing: 5) {
                        Image(systemName: Self.playerSymbol(p.order))
                            .font(.system(size: 9)).foregroundStyle(XITheme.gold)
                        Text(p.name).font(.system(.caption, design: .serif)).lineLimit(1)
                            .foregroundStyle(XITheme.ink)
                    }
                    .padding(.vertical, 4).padding(.horizontal, 8)
                    .background(XITheme.white)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(XITheme.line, lineWidth: 0.5))
                    status.hidden()
                }
                .frame(maxWidth: .infinity)
            }
        }
    }

    // MARK: waiting room

    @ViewBuilder
    private var waitingPanel: some View {
        if let g = game {
            let missing = max(0, g.expectedPlayers - g.players.count)
            VStack(spacing: 14) {
                // Who's in: tracked invites show each seat by name; otherwise
                // just the joined players.
                if !g.invites.isEmpty {
                    VStack(spacing: 4) {
                        ForEach(Array(g.invites.enumerated()), id: \.offset) { _, inv in
                            let joined = inv.claimedBy != nil
                            Text("\(inv.name.isEmpty ? "a friend" : inv.name)\(joined ? "  ✓" : "  …")")
                                .font(.system(.subheadline, design: .serif))
                                .foregroundStyle(joined ? XITheme.ink : XITheme.line)
                        }
                    }
                } else {
                    let others = g.players.filter { $0.uid != uid }
                    Text(others.isEmpty
                         ? "Waiting for \(missing) more \(missing == 1 ? "player" : "players")…"
                         : "\(others.map(\.name).joined(separator: ", ")) joined — \(missing) more to go")
                        .font(.system(.subheadline, design: .serif))
                        .foregroundStyle(XITheme.ink)
                }
                // Inviting lives HERE — once the game begins it's locked to its
                // players, so there's no share button anywhere else. Once
                // anyone has been invited or joined, the label goes plural —
                // "invite a friend" after inviting people read as if it hadn't
                // taken.
                let invitedAny = !g.invites.isEmpty || g.players.count > 1 || g.expectedPlayers > 2
                ShareLink(item: shareText) {
                    Text(invitedAny ? "invite more friends" : "invite a friend")
                        .font(.system(.body, design: .serif))
                        .padding(.horizontal, 28).padding(.vertical, 10)
                        .background(XITheme.gold).foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                }
                Text("The game starts for everyone the moment the last player joins.")
                    .font(.system(.footnote, design: .serif)).foregroundStyle(XITheme.line)
            }
            .padding(.top, 8)
        }
    }

    // MARK: board

    private var board: some View {
        VStack(spacing: 5) {
            ForEach(0..<5, id: \.self) { r in
                HStack(spacing: 5) {
                    ForEach(0..<5, id: \.self) { c in cell(r, c) }
                }
            }
        }
        // One merged gold rectangle around the chosen card(s): a single cell
        // after the first tap, growing to span the pair while its story is
        // written — same frame as Board of the Day.
        .overlayPreferenceValue(VersusFrameKey.self) { anchors in
            GeometryReader { proxy in
                if !anchors.isEmpty {
                    let rects = anchors.map { proxy[$0] }
                    let union = rects.dropFirst().reduce(rects[0]) { $0.union($1) }
                    RoundedRectangle(cornerRadius: 5)
                        .stroke(XITheme.gold, lineWidth: 2.5)
                        .frame(width: union.width + 4, height: union.height + 4)
                        .position(x: union.midX, y: union.midY)
                        .allowsHitTesting(false)
                }
            }
        }
    }

    @ViewBuilder
    private func cell(_ r: Int, _ c: Int) -> some View {
        let key = "\(r),\(c)"
        if let p = byCell[key] {
            let isEvent = p.d == "be"
            let card = isEvent ? XIDeck.events[p.i] : XIDeck.twists[p.i]
            let framed = anchor == Anchor(r: r, c: c) || composedCells.contains(key)
            let marks = visibleStories
                .filter { $0.pairKey.components(separatedBy: "__").contains(card.id) }
                .compactMap { st in game?.players.first { $0.uid == st.byUid }?.order }
            VersusCardCell(card: card, isEvent: isEvent,
                           ownerOrder: game?.players.first { $0.uid == p.by }?.order,
                           anchored: false,
                           storyMarks: marks)
                .anchorPreference(key: VersusFrameKey.self, value: .bounds) {
                    framed ? [$0] : []
                }
                .onTapGesture { tapPlaced(r, c, p) }
        } else {
            // No "legal cells" highlighting — placement still only lands on a
            // valid neighbor, it just isn't advertised (kept the game fun).
            RoundedRectangle(cornerRadius: 4)
                .fill(Color.black.opacity(0.025))
                .aspectRatio(1, contentMode: .fit)
                .onTapGesture { if legal.contains(key) { place(r, c) } }
        }
    }

    // MARK: hand

    @ViewBuilder
    private var hand: some View {
        if !store.hand.isEmpty && !iActed && !iPlaced {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(store.hand, id: \.key) { card in
                        let isEvent = card.d == "be"
                        let xc = isEvent ? XIDeck.events[card.i] : XIDeck.twists[card.i]
                        VersusCardCell(card: xc, isEvent: isEvent, ownerOrder: nil,
                                       anchored: selectedCard == card)
                            .frame(width: 78, height: 78)
                            .onTapGesture { selectedCard = (selectedCard == card) ? nil : card; anchor = nil }
                    }
                }
                .padding(.horizontal, 2)
            }
        }
    }

    // MARK: controls

    @ViewBuilder
    private var controls: some View {
        HStack(spacing: 10) {
            if iPlaced {
                Button("undo placement") { run { try await VersusService.shared.undoLastMove(gameId) } }
                    .buttonStyle(VersusButton(filled: false))
            }
        }
        .disabled(busy)
    }

    // MARK: stories feed

    @ViewBuilder
    private var stories: some View {
        if !visibleStories.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                Text("stories").font(.system(.subheadline, design: .serif)).foregroundStyle(XITheme.gold)
                ForEach(visibleStories) { s in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 6) {
                            // The teller's gold shape (same one shown on their cards),
                            // not a coloured dot — matches the player list up top.
                            let order = game?.players.first { $0.uid == s.byUid }?.order
                            Image(systemName: Self.playerSymbol(order ?? 2))
                                .font(.system(size: 9)).foregroundStyle(XITheme.gold)
                            Text(s.byName).font(.system(.caption, design: .serif, weight: .medium)).foregroundStyle(XITheme.ink)
                            Spacer()
                            Text("times i \(s.eventCap.lowercased()), \(s.twistCap.lowercased())")
                                .font(.system(.caption2, design: .serif)).foregroundStyle(XITheme.line)
                                .lineLimit(1)
                            storyMenu(s)
                        }
                        Text(s.text).font(.system(.body, design: .serif)).foregroundStyle(XITheme.ink)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(XITheme.white)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(XITheme.line, lineWidth: 0.5))
                }
            }
            .padding(.top, 8)
        }
    }

    /// Report / block menu — only for other players' stories.
    @ViewBuilder
    private func storyMenu(_ s: VersusStory) -> some View {
        if let myUid = uid, !s.byUid.isEmpty, s.byUid != myUid {
            Menu {
                Button { reportingStory = s } label: { Label("Report story", systemImage: "flag") }
                Button(role: .destructive) {
                    withAnimation { moderation.block(s.byUid, name: s.byName) }
                } label: {
                    Label("Block \(s.byName)", systemImage: "hand.raised")
                }
            } label: {
                Image(systemName: "ellipsis").font(.caption).foregroundStyle(XITheme.line)
                    .frame(width: 24, height: 18, alignment: .trailing).contentShape(Rectangle())
            }
        }
    }

    private var shareText: String {
        "Join my XI Versus game — tap to play: https://incaseofamnesia.com/versus/\(gameId)"
    }

    // MARK: interaction

    private func place(_ r: Int, _ c: Int) {
        guard let card = selectedCard else { return }
        run {
            try await VersusService.shared.placeCard(gameId, card: card, r: r, c: c)
            await MainActor.run { selectedCard = nil }
        }
    }

    private func tapPlaced(_ r: Int, _ c: Int, _ p: VersusPlaced) {
        guard game?.isWaiting != true else { return }         // waiting room: view only
        if selectedCard != nil { selectedCard = nil; return } // placing — ignore filled cells
        let here = Anchor(r: r, c: c)
        guard let a = anchor else { anchor = here; return }
        if a == here { anchor = nil; return }
        let adjacent = abs(a.r - r) + abs(a.c - c) == 1
        guard adjacent, let other = byCell["\(a.r),\(a.c)"] else { anchor = here; return }
        let (ev, tw) = p.d == "be" ? (p, other) : (other, p)
        guard ev.d == "be", tw.d == "bw" else { anchor = here; return }
        composedCells = ["\(a.r),\(a.c)", "\(r),\(c)"]  // keep the pair framed while writing
        composing = StoryTarget(event: ev, twist: tw)
        anchor = nil
    }

    private func run(_ op: @escaping () async throws -> Void) {
        busy = true; error = nil
        Task {
            do { try await op() } catch { await MainActor.run { self.error = error.localizedDescription } }
            await MainActor.run { busy = false }
        }
    }
}

// MARK: - How to play

/// The game instructions, tucked behind the ⓘ in the top-right corner —
/// nothing on the board itself. Mirrors Board of the Day's help sheet.
private struct VersusHelpSheet: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    help("Each round, **place one card** from your hand in a cell touching a card already on the board.")
                    help("Then tap **two touching cards** to write the story that's both of them (\u{201C}times i\u{2026}\u{201D}) — that finishes your go.")
                    help("Everyone goes once per round; the next round starts when all players have gone.")
                    help("Your stories are saved to your library. Friends' stories land in your Commons.")
                }
                .padding(20)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(XITheme.paper.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text("how to play")
                        .font(.system(.headline, design: .serif)).foregroundStyle(XITheme.ink)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }.tint(XITheme.line).accessibilityLabel("Close")
                }
            }
        }
        .presentationDetents([.medium])
        .tint(XITheme.gold)
    }

    private func help(_ markdown: String) -> some View {
        Text((try? AttributedString(markdown: markdown)) ?? AttributedString(markdown))
            .font(.system(.callout, design: .serif))
            .foregroundStyle(XITheme.ink)
            .fixedSize(horizontal: false, vertical: true)
    }
}

// MARK: - Board / hand card cell

struct VersusCardCell: View {
    let card: XICard
    let isEvent: Bool
    let ownerOrder: Int?   // join order of the placer → their shape; nil if unowned
    let anchored: Bool
    /// One mark per story written on a pairing this card belongs to — the
    /// teller's gold shape, accruing like the web's story tokens (max 8 shown).
    var storyMarks: [Int] = []

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 4).fill(isEvent ? XITheme.cream : XITheme.white)
            CardArt(card: card, capSize: 9, pad: 1, blend: false)
        }
        .aspectRatio(1, contentMode: .fit)
        .overlay(RoundedRectangle(cornerRadius: 4)
            .stroke(anchored ? XITheme.gold : XITheme.line, lineWidth: anchored ? 2.5 : 0.5))
        // Who placed a memory here — a small gold player shape, not a colour.
        .overlay(alignment: .topTrailing) {
            if let ownerOrder {
                Image(systemName: VersusGameView.playerSymbol(ownerOrder))
                    .font(.system(size: 8))
                    .foregroundStyle(XITheme.gold)
                    .padding(2.5)
                    .background(XITheme.white.opacity(0.9), in: Circle())
                    .padding(2)
            }
        }
        // Stories live here — one tiny teller-shape per story on this card's
        // pairings, collecting along the bottom edge.
        .overlay(alignment: .bottomLeading) {
            if !storyMarks.isEmpty {
                HStack(spacing: 2) {
                    ForEach(Array(storyMarks.prefix(8).enumerated()), id: \.offset) { _, order in
                        Image(systemName: VersusGameView.playerSymbol(order))
                            .font(.system(size: 6))
                            .foregroundStyle(XITheme.gold)
                    }
                }
                .padding(.horizontal, 3).padding(.vertical, 2)
                .background(XITheme.white.opacity(0.85), in: RoundedRectangle(cornerRadius: 3))
                .padding(3)
            }
        }
    }
}

struct VersusButton: ButtonStyle {
    let filled: Bool
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(.subheadline, design: .serif))
            .padding(.vertical, 9).padding(.horizontal, 16)
            .background(filled ? XITheme.gold : XITheme.white)
            .foregroundStyle(filled ? .white : XITheme.gold)
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(XITheme.gold.opacity(filled ? 0 : 0.5), lineWidth: 1))
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

// MARK: - Story composer

struct StoryComposer: View {
    let gameId: String
    let event: VersusPlaced
    let twist: VersusPlaced
    var onDone: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var busy = false
    @State private var error: String?
    @FocusState private var writing: Bool

    private var evCard: XICard { XIDeck.events[event.i] }
    private var twCard: XICard { XIDeck.twists[twist.i] }

    // Mirrors the board's ComposerSheet exactly: a half-height sheet (the game
    // board stays visible behind it), the two cards big up top, the prompt, and
    // a normal fixed-height memory box that scrolls internally.
    var body: some View {
        VStack(spacing: 14) {
            HStack(spacing: 10) {
                storyCard(evCard, isEvent: true)
                storyCard(twCard, isEvent: false)
            }
            .padding(.top, 18)

            Text("times i \(evCard.cap.lowercased()), \(twCard.cap.lowercased())")
                .font(.system(.title3, design: .serif))
                .multilineTextAlignment(.center)
                .foregroundStyle(XITheme.ink)
                .padding(.horizontal, 8)

            ZStack(alignment: .topLeading) {
                if text.isEmpty {
                    Text("tell the story…").font(.system(.body, design: .serif))
                        .foregroundStyle(XITheme.line).padding(.top, 16).padding(.leading, 13)
                }
                TextEditor(text: $text)
                    .font(.system(.body, design: .serif)).foregroundStyle(XITheme.ink)
                    .focused($writing)
                    .frame(height: 120)
                    .padding(8)
                    .scrollContentBackground(.hidden)
            }
            .background(XITheme.white)
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(XITheme.line))

            if let error { Text(error).font(.footnote).foregroundStyle(.red) }

            Button(action: save) {
                Text(busy ? "saving…" : "save")
                    .font(.system(.body, design: .serif))
                    .padding(.horizontal, 28).padding(.vertical, 10)
                    .background(XITheme.gold).foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
            }
            .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || busy)
            .opacity(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.5 : 1)

            Spacer(minLength: 0)
        }
        .padding(20)
        .background(XITheme.paper.onTapGesture { writing = false })
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { writing = false }
                    .font(.system(.body, design: .serif)).tint(XITheme.gold)
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func storyCard(_ card: XICard, isEvent: Bool) -> some View {
        ZStack {
            (isEvent ? XITheme.cream : XITheme.white)
            CardArt(card: card, capSize: 11, pad: 2)
        }
        .frame(width: 132, height: 132)
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .overlay(RoundedRectangle(cornerRadius: 6).stroke(XITheme.line, lineWidth: 0.5))
    }

    private func save() {
        busy = true; error = nil
        Task {
            do {
                try await VersusService.shared.writeStory(gameId, event: event, twist: twist, text: text)
                await MainActor.run { onDone(); dismiss() }
            } catch {
                await MainActor.run { self.error = error.localizedDescription; busy = false }
            }
        }
    }
}
