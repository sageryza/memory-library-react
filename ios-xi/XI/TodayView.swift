import SwiftUI

/// "Card of the Day" — two cards (one event + one twist) drawn from the deck,
/// with a composer to write one memory that is both of them.
///
/// The screen is the settled "2a" direction from design/xi-redesign ("deco
/// tarot, refined"), ported from the Claude Design artboard: cream page inside
/// a double frame, Marcellus masthead over a rule broken by a small lozenge,
/// the day's pair tilted ±2.5°, redraw/nothing as quiet italic links, the gold
/// fill bar above the write box, lowercase italic save on ink, and collected
/// memories straight on their own light-outlined cards.
///
/// Three things came off the artboard afterwards, at Sophie's ask (Aug 2026):
/// the pair's hard offset shadows, and the gold + oxblood accents — black and
/// gray in their place, with the fill bar the one thing left gold. The nav is
/// the app's own bar again, untouched. See XiDeco in XITheme.swift.
struct TodayView: View {
    @ObservedObject private var curate = CurateStore.shared

    /// Full-pool indices. The daily pair — like redraws and new Versus games —
    /// honors your Curate picks: the deterministic walk draws only from the
    /// decks/cards you've kept, so curating shapes the whole app.
    @State private var ev = 0
    @State private var tw = 0

    @State private var text = ""
    @State private var saving = false
    @State private var saveError: String?
    @State private var memories: [XIMemory] = []
    @State private var totalCount = 0
    @State private var started = false
    @State private var showSettings = false
    @FocusState private var writing: Bool

    // Public sharing (Sage's spec): one-time prompt around the 3rd memory;
    // in "ask" mode a per-memory toggle appears, defaulted to private.
    @ObservedObject private var sharePrefs = SharePrefs.shared
    @StateObject private var moderation = Moderation()
    @State private var shareThisOne = false
    @State private var showSharePrompt = false
    @State private var lastSavedId: String?
    @State private var realOthers: [XIService.PublicOther] = []
    @State private var reportingOther: XIService.PublicOther?

    /// Pairs marked "nothing" (the design's quiet second link; the web app
    /// keeps the same record as xi2_misses). Toggling it turns the pair's
    /// inner card lines black — the web marks a miss the same way.
    @State private var missed: Set<String> =
        Set(UserDefaults.standard.stringArray(forKey: "xi_missedPairs") ?? [])

    private var event: XICard { XIDeck.events[min(max(0, ev), XIDeck.events.count - 1)] }
    private var twist: XICard { XIDeck.twists[min(max(0, tw), XIDeck.twists.count - 1)] }
    private var pairKey: String { "\(event.id)__\(twist.id)" }
    private var isMissed: Bool { missed.contains(pairKey) }

    /// The day's pair: the event is THE card of the day — one shared card,
    /// identical for everyone in the world (XIDeck.anchorIndex), untouched by
    /// personal curation. The twist walks YOUR curated pool backward from the
    /// end, falling back to the full non-retired pool if curation emptied it.
    private func dayPairIndices(_ dn: Int) -> (Int, Int) {
        let at = curate.allowedTwists
        let twPool = at.isEmpty ? CurateStore.liveIndices(XIDeck.twists) : at
        guard !twPool.isEmpty else { return (XIDeck.anchorIndex(day: dn), 0) }
        let ei = XIDeck.anchorIndex(day: dn)
        let ti = twPool[((((twPool.count - 1 - dn) % twPool.count) + twPool.count) % twPool.count)]
        return (ei, ti)
    }

    @ObservedObject private var kb = KeyboardHeight.shared

    var body: some View {
        ScrollViewReader { proxy in
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                masthead
                header
                cardRow
                redrawRow
                fillBar
                composer.id("composer")
                collected
                others
            }
            // The artboard's 30px page margins, measured from the page edge —
            // the scroll view already sits XiDeco.frameInset in from it.
            .padding(.horizontal, 30 - XiDeco.frameInset)
            // The nav is a sibling below this screen, so the page already ends
            // above it; while writing, pad by the keyboard instead (the shell
            // pins the nav by ignoring the keyboard's safe area, so avoidance
            // is manual here) and scroll the composer up above it.
            .padding(.bottom, kb.height > 0 ? kb.height + 16 : 30 - XiDeco.frameInset)
            .frame(maxWidth: .infinity)
        }
        .onChange(of: kb.height) { h in
            if h > 0 && writing {
                withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo("composer", anchor: .bottom) }
            }
        }
        }
        // The page is inset to the frame's inner edge so the SCROLL VIEW clips
        // it there: the frame is drawn over the page, so without this the
        // masthead slid up under the top line and went on being readable in
        // the margin outside it — the line cutting across the letters instead
        // of framing them (Sophie, Aug 2026: "it scrolls over content when it
        // should be framing it"). Inset, content vanishes AT the line.
        .padding(XiDeco.frameInset)
        .background(XiDeco.cream.ignoresSafeArea())
        // The 2a double frame — fixed chrome the page is framed by:
        // 1.5px light at inset 10, 1px at inset 14 (gilt on the artboard, gray
        // since the accents came off).
        .overlay(
            ZStack {
                RoundedRectangle(cornerRadius: XiDeco.corner)
                    .strokeBorder(XiDeco.lightLine, lineWidth: 1.5)
                    .padding(10)
                RoundedRectangle(cornerRadius: XiDeco.corner)
                    .strokeBorder(XiDeco.rule, lineWidth: 1)
                    .padding(14)
            }
            .allowsHitTesting(false)
        )
        // Tapping anywhere outside the text box dismisses the keyboard.
        .onTapGesture { writing = false }
        // Settings must stay reachable (account deletion lives there — an App
        // Store requirement), so the gear stays: the one thing on the screen
        // the artboard doesn't draw, kept as quiet as the redraw links.
        .overlay(alignment: .topTrailing) {
            Button { showSettings = true } label: {
                Image(systemName: "gearshape").font(.system(size: 17))
                    .foregroundStyle(XiDeco.ink.opacity(0.35))
            }
            .padding(.top, 26).padding(.trailing, 26)
        }
        .sheet(isPresented: $showSettings) { SettingsView() }
        .scrollDismissesKeyboard(.interactively)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { writing = false }
                    .font(.system(.body, design: .serif)).tint(XiDeco.ink)
            }
        }
        .task { startIfNeeded(); await loadTotal() }
        .task(id: pairKey) { await reload() }
        .task(id: pairKey) { realOthers = await XIService.shared.publicOthers(pairKey: pairKey) }
        .sharePrompt(isPresented: $showSharePrompt, savedMemoryId: lastSavedId)
        .sheet(item: $reportingOther) { other in
            ReportSheet(
                subjectLabel: "memory",
                onSubmit: { reason, details in
                    Task { try? await XIService.shared.reportPublicMemory(other, reason: reason, details: details) }
                    reportingOther = nil
                },
                onCancel: { reportingOther = nil })
        }
        .task(id: pairKey) {
            // Seen this pair before → its texts render instantly (and are the
            // SAME as last time — they're "what others wrote", so they must
            // not reshuffle). Only a brand-new pair goes to the AI, behind
            // fixed-size placeholders so nothing jumps when it lands.
            if let hit = XIService.shared.cachedOthers(pairKey) {
                othersTexts = hit
                othersLoading = false
                return
            }
            othersTexts = []
            othersLoading = true
            othersTexts = await XIService.shared.generateOthers(
                pairKey: pairKey, eventCap: event.cap, twistCap: twist.cap) ?? []
            othersLoading = false
        }
    }

    // MARK: masthead + header

    /// XI in wide-tracked Marcellus over a rule broken by a small lozenge —
    /// the artboard's masthead, in the neutral accents. Tracking adds a trailing space per
    /// glyph, so the leading padding recenters it (the CSS text-indent trick).
    private var masthead: some View {
        VStack(spacing: 0) {
            Text("XI")
                .font(XiDeco.marcellus(30))
                .tracking(12.6)
                .padding(.leading, 12.6)
                .foregroundStyle(XiDeco.ink)
            HStack(spacing: 10) {
                Rectangle().fill(XiDeco.rule).frame(width: 54, height: 1)
                Rectangle().fill(XiDeco.mark).frame(width: 6, height: 6)
                    .rotationEffect(.degrees(45))
                Rectangle().fill(XiDeco.rule).frame(width: 54, height: 1)
            }
            .padding(.top, 6)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 32 - XiDeco.frameInset)
    }

    private var header: some View {
        VStack(spacing: 0) {
            Text("CARD OF THE DAY")
                .font(XiDeco.marcellus(12))
                .tracking(3.6)
                .padding(.leading, 3.6)
                .foregroundStyle(XiDeco.mark)
                .padding(.top, 12)
            Text(Date.now, format: .dateTime.month(.wide).day())
                .font(XiDeco.garamondItalic(14.5))
                .foregroundStyle(XiDeco.ink.opacity(0.55))
                .padding(.top, 2)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: cards

    private var cardRow: some View {
        HStack(alignment: .center, spacing: 14) {
            DecoTodayCard(card: event, tilt: -2.5, missed: isMissed)
            DecoTodayCard(card: twist, tilt: 2.5, missed: isMissed)
        }
        .padding(.top, 26)
    }

    /// ONE quiet italic link — no border, no underline (explicit design note).
    /// It was two, "redraw" and "nothing", and they asked the same thing twice
    /// (Sophie, Aug 2026: "rather than having a redraw and nothing button just
    /// make one button that says I got nothing … once they have added at least
    /// one memory the button becomes 'new cards'"). Both labels draw new cards;
    /// the word is what changed, and it changes with what she did with the pair
    /// in front of her — nothing to say about it, or something already said.
    /// "i got nothing" also keeps the old button's record: the pair is marked a
    /// miss on the way past, the same mark the web keeps as xi2_misses.
    private var redrawRow: some View {
        let gotNothing = memories.isEmpty
        return Button {
            if gotNothing { markNothing() }
            newCards()
        } label: {
            Text(gotNothing ? "i got nothing" : "new cards")
                .font(XiDeco.garamondItalic(14))
                .foregroundStyle(XiDeco.ink.opacity(0.45))
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity)
        .padding(.top, 18)
    }

    // MARK: fill bar

    /// The gold fill bar (not diamonds) above the write box — five ticks, the
    /// fill is the day's collected count out of five. The ONE element that
    /// keeps its gilt: "keep the gold progress bar tho" (Sophie, Aug 2026).
    private var fillBar: some View {
        let goal = 5
        let frac = min(1.0, Double(totalCount) / Double(goal))
        return GeometryReader { geo in
            ZStack(alignment: .leading) {
                // Always a sliver of gold at the very left, even at zero — the
                // bar should show what it's going to do before you fill it.
                Rectangle().fill(XiDeco.gilt)
                    .frame(width: max(5, geo.size.width * frac))
                ForEach(1..<goal, id: \.self) { k in
                    Rectangle().fill(XiDeco.ink.opacity(0.25))
                        .frame(width: 1)
                        .offset(x: geo.size.width * (Double(k) / Double(goal)) - 0.5)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        // 14 rather than the artboard's 9 — half again as thick (Sophie, Aug
        // 2026: "a bit thicker maybe 1.5 or two times"). The 5pt corner is
        // left alone: it was nearly a full round at 9 tall and reads as a
        // proper rounded rectangle at 14.
        .frame(height: 14)
        .background(XiDeco.surface)
        .clipShape(RoundedRectangle(cornerRadius: 5))
        .overlay(RoundedRectangle(cornerRadius: 5).strokeBorder(XiDeco.gilt, lineWidth: 1))
        .animation(.easeOut(duration: 0.5), value: totalCount)
        .padding(.top, 18)
        .accessibilityLabel("\(min(totalCount, goal)) of \(goal) memories collected today")
    }

    // MARK: composer

    private var composer: some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 8) {
                ZStack(alignment: .topLeading) {
                    if text.isEmpty {
                        Text("Write the memory…")
                            .font(XiDeco.garamondItalic(16.5))
                            .foregroundStyle(XiDeco.ink.opacity(0.4))
                            .padding(.horizontal, 15).padding(.top, 13)
                    }
                    // Fixed height so the editor scrolls INTERNALLY as you
                    // type — the caret always stays visible instead of the box
                    // growing past the bottom of the screen. (TextEditor adds
                    // ~5pt/8pt of its own insets; the paddings land the text
                    // on the artboard's 13px/15px.)
                    TextEditor(text: $text)
                        .focused($writing)
                        .font(XiDeco.garamond(16.5)).foregroundStyle(XiDeco.ink)
                        .frame(height: 66)
                        .scrollContentBackground(.hidden)
                        .padding(.horizontal, 10).padding(.top, 5)
                }
                HStack {
                    Spacer()
                    Button { Task { await save() } } label: {
                        Text(saving ? "saving…" : "save")
                            .font(XiDeco.garamondItalic(15.5))
                            .tracking(0.93)
                            .foregroundStyle(XiDeco.cream)
                            .padding(.vertical, 7).padding(.horizontal, 22)
                            .background(XiDeco.ink, in: RoundedRectangle(cornerRadius: XiDeco.corner))
                    }
                    .disabled(saving || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .opacity(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.5 : 1)
                }
                .padding(.trailing, 15).padding(.bottom, 13)
            }
            .background(XiDeco.surface, in: RoundedRectangle(cornerRadius: XiDeco.corner))
            .overlay(RoundedRectangle(cornerRadius: XiDeco.corner)
                .strokeBorder(XiDeco.lightLine, lineWidth: 1))

            if sharePrefs.mode == .ask {
                ShareToggleRow(isOn: $shareThisOne)
            }
            if let saveError {
                Text(saveError).font(XiDeco.garamondItalic(13)).foregroundStyle(XiDeco.ink)
            }
        }
        .padding(.top, 10)
    }

    // MARK: collected

    @ViewBuilder
    private var collected: some View {
        if !memories.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 8) {
                    Text("COLLECTED")
                        .font(XiDeco.marcellus(10)).tracking(2.4)
                        .foregroundStyle(XiDeco.mark)
                    Rectangle().fill(XiDeco.rule).frame(height: 1)
                }
                .padding(.bottom, 11)
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(memories) { m in
                        memoryCard {
                            Text(m.content).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
            .padding(.top, 22)
        }
    }

    /// One collected memory, exactly as the artboard draws it: straight (no
    /// tilt), card surface, light outline, no shadow, its own island — and the
    /// page frame's own 2pt corner (Sophie, Aug 2026).
    private func memoryCard<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 4) { content() }
            .font(XiDeco.garamond(16))
            .lineSpacing(3.5)
            .foregroundStyle(XiDeco.ink)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 14).padding(.vertical, 12)
            .background(XiDeco.surface, in: RoundedRectangle(cornerRadius: XiDeco.corner))
            .overlay(RoundedRectangle(cornerRadius: XiDeco.corner)
                .strokeBorder(XiDeco.lightLine, lineWidth: 1))
    }

    // MARK: others (display-only — AI-written memories that combine BOTH of the
    // current cards, attributed to seeded personas. Never saved anywhere; if the
    // AI is unavailable, the section simply doesn't appear.)

    @State private var othersTexts: [String] = []
    @State private var othersLoading = false

    /// Real shared memories, minus anyone you've blocked.
    private var visibleRealOthers: [XIService.PublicOther] {
        realOthers.filter { !moderation.isBlocked($0.byUid) }
    }

    @ViewBuilder
    private var others: some View {
        // REAL people first, newest first — with report/block on each.
        if !visibleRealOthers.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                ForEach(visibleRealOthers) { other in
                    memoryCard {
                        HStack {
                            Text(other.byName)
                                .font(XiDeco.garamondItalic(12))
                                .foregroundStyle(XiDeco.ink.opacity(0.55))
                            Spacer()
                            Menu {
                                Button { reportingOther = other } label: {
                                    Label("Report memory", systemImage: "flag")
                                }
                                Button(role: .destructive) {
                                    withAnimation { moderation.block(other.byUid, name: other.byName) }
                                } label: {
                                    Label("Block \(other.byName)", systemImage: "hand.raised")
                                }
                            } label: {
                                Image(systemName: "ellipsis").font(.caption)
                                    .foregroundStyle(XiDeco.lightLine)
                                    .padding(.horizontal, 4)
                            }
                        }
                        Text(other.content)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .padding(.top, 18)
        }
        // AI placeholders pinned BELOW the real ones; gone entirely once a
        // pair has 5 real memories (Sage's transition rule).
        if visibleRealOthers.count < 5 {
            aiOthers
        }
    }

    @ViewBuilder
    private var aiOthers: some View {
        if !othersTexts.isEmpty {
            let authors = XIRobots.authors(for: pairKey, count: othersTexts.count)
            // Styled exactly like your own collected memories, with the writer's
            // name on top in a quiet italic.
            VStack(alignment: .leading, spacing: 12) {
                ForEach(Array(othersTexts.enumerated()), id: \.offset) { i, text in
                    memoryCard {
                        Text(authors[i])
                            .font(XiDeco.garamondItalic(12))
                            .foregroundStyle(XiDeco.ink.opacity(0.55))
                        Text(text)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .padding(.top, 18)
        } else if othersLoading {
            // Placeholder cards while the AI writes a new pair's memories: the
            // authors are already known (deterministic per pair), and the text
            // area is blocked out at roughly its final size so the screen
            // doesn't shove around when the words arrive.
            let authors = XIRobots.authors(for: pairKey, count: 3)
            VStack(alignment: .leading, spacing: 12) {
                ForEach(0..<3, id: \.self) { i in
                    memoryCard {
                        Text(authors[i])
                            .font(XiDeco.garamondItalic(12))
                            .foregroundStyle(XiDeco.ink.opacity(0.55))
                        RoundedRectangle(cornerRadius: 3).fill(XiDeco.lightLine.opacity(0.35))
                            .frame(height: 9)
                        RoundedRectangle(cornerRadius: 3).fill(XiDeco.lightLine.opacity(0.35))
                            .frame(height: 9)
                            .padding(.trailing, 70)
                    }
                }
            }
            .padding(.top, 18)
        }
    }

    // MARK: logic

    private func startIfNeeded() {
        guard !started else { return }
        started = true
        // The day's pair, drawn from your curated pools.
        guard !XIDeck.events.isEmpty, !XIDeck.twists.isEmpty else { return }
        (ev, tw) = dayPairIndices(BoardEngine.dayNumber())
    }

    /// The next in-play index walking `step` through a pool, skipping cards
    /// your Curate choices removed (✕, disabled decks) — the web's stepI.
    private func stepIndex(_ i: Int, poolSize: Int, allowed: [Int], step: Int) -> Int {
        guard poolSize > 0 else { return 0 }
        // Everything curated away → walk the full pool rather than deal nothing.
        let inPlay = allowed.isEmpty ? nil : Set(allowed)
        var j = i
        for _ in 0..<poolSize {
            j = (j + step + poolSize) % poolSize
            if inPlay?.contains(j) ?? true { return j }
        }
        return (i + step + poolSize) % poolSize
    }

    private func newCards() {
        // Only the twist redraws — the event is THE card of the day, the one
        // card everyone in the world shares (July 2026, "card of the day").
        let at = curate.allowedTwists
        tw = stepIndex(tw, poolSize: XIDeck.twists.count,
                       allowed: at.isEmpty ? CurateStore.liveIndices(XIDeck.twists) : at, step: -1)
        text = ""
    }

    /// Mark this pair a miss. One direction only now: the button that used to
    /// toggle it draws new cards in the same tap, so there is no second tap to
    /// un-mark with — and saying "i got nothing" about a pair you have left is
    /// not something you take back by accident.
    private func markNothing() {
        guard !missed.contains(pairKey) else { return }
        missed.insert(pairKey)
        UserDefaults.standard.set(Array(missed), forKey: "xi_missedPairs")
    }

    private func reload() async {
        memories = await XIService.shared.memories(pairKey: pairKey)
    }

    /// How many memories were collected TODAY (a daily tally, not an all-time
    /// running total).
    private func loadTotal() async {
        let all = await XIService.shared.allMemories()
        let full = ISO8601DateFormatter(); full.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter(); plain.formatOptions = [.withInternetDateTime]
        let cal = Calendar.current
        totalCount = all.filter { m in
            guard let d = full.date(from: m.timestamp) ?? plain.date(from: m.timestamp) else { return false }
            return cal.isDateInToday(d)
        }.count
    }

    private func save() async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        saving = true; saveError = nil
        defer { saving = false }
        do {
            let id = try await XIService.shared.saveMemory(
                event: event, twist: twist, text: trimmed,
                boardDay: BoardEngine.dayNumber(), mode: "daily",
                share: sharePrefs.shareForSave(askToggle: shareThisOne))
            text = ""
            writing = false
            shareThisOne = false
            await reload()
            await loadTotal()
            if sharePrefs.shouldPrompt(totalMemories: totalCount) {
                lastSavedId = id
                showSharePrompt = true
            }
        } catch {
            saveError = error.localizedDescription
        }
    }
}

/// One of the day's pair: a tilted plate of card surface with a light outline,
/// the picture inside its own hairline. No drop shadow (Sophie took the
/// oxblood/gilt pair off) and the hairline is gray rather than gilt.
///
/// `trimFrame` is what keeps that hairline the ONLY line around the picture:
/// the card images each carry their own printed rule, which otherwise stacks a
/// third border inside the plate. While the art loads — or if it never comes —
/// the caption shows in the artboard's text-card style. When the pair is marked
/// "nothing", the hairline goes full black.
private struct DecoTodayCard: View {
    let card: XICard
    let tilt: Double
    let missed: Bool

    var body: some View {
        ZStack {
            XiDeco.surface
            CardArt(card: card, capSize: 15, pad: 2,
                    capFont: .custom("HelveticaNeue-Bold", fixedSize: 15), trimFrame: true)
        }
        .aspectRatio(1, contentMode: .fit)
        .overlay(Rectangle().strokeBorder(missed ? XiDeco.mark : XiDeco.cardLine, lineWidth: 1))
        .padding(6)
        .background(XiDeco.surface)
        .overlay(Rectangle().strokeBorder(XiDeco.lightLine, lineWidth: 1))
        .rotationEffect(.degrees(tilt))
    }
}
