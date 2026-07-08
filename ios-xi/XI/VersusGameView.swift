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
                        Task {
                            try? await VersusService.shared.reportStory(
                                gameId: gameId, story: story, reason: reason, details: details)
                        }
                        reportingStory = nil; reported = true
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
    }

    /// Copy other players' stories into your Commons — you're playing together, so
    /// they're friends. Your own stories go to your library (see writeStory), never
    /// here; blocked players are skipped.
    private func syncOpponentStoriesToCommons(_ stories: [VersusStory]) {
        guard let myUid = uid else { return }
        for s in stories where s.byUid != myUid && !s.byUid.isEmpty
            && !syncedStoryIds.contains(s.id) && !moderation.isBlocked(s.byUid) {
            syncedStoryIds.insert(s.id)
            let title = "times i \(s.eventCap.lowercased()) \(s.twistCap.lowercased())"
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
            .navigationTitle("Versus")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    ShareLink(item: shareText) { Image(systemName: "square.and.arrow.up") }.tint(XITheme.gold)
                }
            }
            .tint(XITheme.gold)
    }

    private var scroll: some View {
        ScrollView {
            VStack(spacing: 16) {
                if store.notFound {
                    Text("Game not found.").font(.system(.body, design: .serif)).foregroundStyle(.red).padding(.top, 40)
                } else if game == nil {
                    ProgressView().tint(XITheme.gold).padding(.top, 40)
                } else {
                    header
                    board
                    prompt
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

    // MARK: header — just the players (code lives behind the share button, no
    // rounds). Kept deliberately spare per feedback: the board is the focus.

    @ViewBuilder
    private var header: some View {
        if let g = game {
            let cols = [GridItem(.adaptive(minimum: 84), spacing: 8)]
            LazyVGrid(columns: cols, spacing: 8) {
                ForEach(g.players) { p in
                    HStack(spacing: 5) {
                        Circle().fill(Color(xiHex: p.color)).frame(width: 9, height: 9)
                        Text(p.name).font(.system(.caption, design: .serif)).lineLimit(1)
                            .foregroundStyle(XITheme.ink)
                        if g.acted.contains(p.uid) {
                            Image(systemName: "checkmark").font(.system(size: 8)).foregroundStyle(XITheme.gold)
                        }
                    }
                    .padding(.vertical, 4).padding(.horizontal, 8)
                    .background(XITheme.white)
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(XITheme.line, lineWidth: 0.5))
                }
            }
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
    }

    @ViewBuilder
    private func cell(_ r: Int, _ c: Int) -> some View {
        let key = "\(r),\(c)"
        if let p = byCell[key] {
            let isEvent = p.d == "be"
            let card = isEvent ? XIDeck.events[p.i] : XIDeck.twists[p.i]
            VersusCardCell(card: card, isEvent: isEvent,
                           owner: p.color, anchored: anchor == Anchor(r: r, c: c))
                .onTapGesture { tapPlaced(r, c, p) }
        } else {
            let isLegal = legal.contains(key)
            RoundedRectangle(cornerRadius: 4)
                .fill(isLegal ? XITheme.gold.opacity(0.18) : Color.black.opacity(0.025))
                .aspectRatio(1, contentMode: .fit)
                .overlay(RoundedRectangle(cornerRadius: 4)
                    .stroke(isLegal ? XITheme.gold : .clear, lineWidth: isLegal ? 2 : 0))
                .onTapGesture { if isLegal { place(r, c) } }
        }
    }

    // MARK: prompt line

    @ViewBuilder
    private var prompt: some View {
        Text(promptText)
            .font(.system(.footnote, design: .serif))
            .foregroundStyle(XITheme.line)
            .multilineTextAlignment(.center)
    }

    private var promptText: String {
        if iActed { return "You've gone this round — waiting on the others." }
        if selectedCard != nil { return "Tap a glowing cell to place your card." }
        if iPlaced { return "Now tap your card and a neighbor to tell their story." }
        return "Pick a card to place, or tap two touching cards to tell their story."
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
                        VersusCardCell(card: xc, isEvent: isEvent, owner: nil,
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
                Text("the stories so far").font(.system(.subheadline, design: .serif)).foregroundStyle(XITheme.gold)
                ForEach(visibleStories) { s in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 6) {
                            Circle().fill(Color(xiHex: s.color)).frame(width: 8, height: 8)
                            Text(s.byName).font(.system(.caption, design: .serif, weight: .medium)).foregroundStyle(XITheme.ink)
                            Spacer()
                            Text("times i \(s.eventCap.lowercased()) \(s.twistCap.lowercased())")
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
        "Join my XI Versus game — code \(gameId) at https://incaseofamnesia.com/xi"
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
        if selectedCard != nil { selectedCard = nil; return } // placing — ignore filled cells
        let here = Anchor(r: r, c: c)
        guard let a = anchor else { anchor = here; return }
        if a == here { anchor = nil; return }
        let adjacent = abs(a.r - r) + abs(a.c - c) == 1
        guard adjacent, let other = byCell["\(a.r),\(a.c)"] else { anchor = here; return }
        let (ev, tw) = p.d == "be" ? (p, other) : (other, p)
        guard ev.d == "be", tw.d == "bw" else { anchor = here; return }
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

// MARK: - Board / hand card cell

struct VersusCardCell: View {
    let card: XICard
    let isEvent: Bool
    let owner: String?     // hex color of the placer, nil for hand cards / unowned
    let anchored: Bool

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 4).fill(isEvent ? XITheme.cream : XITheme.white)
            if let img = card.img, let url = URL(string: XITheme.cardArtBase + img) {
                AsyncImage(url: url) { $0.resizable().scaledToFit() } placeholder: { Color.clear }.padding(1)
            } else {
                Text(card.cap).font(.system(size: 9, design: .serif)).multilineTextAlignment(.center)
                    .foregroundStyle(XITheme.ink).padding(2)
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .overlay(RoundedRectangle(cornerRadius: 4)
            .stroke(anchored ? XITheme.gold : (owner != nil ? Color(xiHex: owner) : XITheme.line),
                    lineWidth: anchored ? 2.5 : (owner != nil ? 2 : 0.5)))
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

    private var evCard: XICard { XIDeck.events[event.i] }
    private var twCard: XICard { XIDeck.twists[twist.i] }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                Text("times i \(evCard.cap.lowercased()) \(twCard.cap.lowercased())")
                    .font(.system(.title3, design: .serif, weight: .semibold))
                    .foregroundStyle(XITheme.ink)
                ZStack(alignment: .topLeading) {
                    if text.isEmpty {
                        Text("tell the story…").font(.system(.body, design: .serif))
                            .foregroundStyle(XITheme.line).padding(.top, 8).padding(.leading, 5)
                    }
                    TextEditor(text: $text)
                        .font(.system(.body, design: .serif)).foregroundStyle(XITheme.ink)
                        .scrollContentBackground(.hidden)
                        .frame(minHeight: 160)
                }
                .padding(8)
                .background(XITheme.white)
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(XITheme.line))
                if let error { Text(error).font(.footnote).foregroundStyle(.red) }
                Spacer()
            }
            .padding(20)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .background(XITheme.paper.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("cancel") { dismiss() }.tint(XITheme.gold)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button(busy ? "…" : "save") { save() }
                        .tint(XITheme.gold)
                        .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || busy)
                }
            }
        }
        .tint(XITheme.gold)
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
