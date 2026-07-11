import SwiftUI

/// "Card of the Day" — two cards (one event + one twist) drawn from the deck,
/// with a composer to write one memory that is both of them. Mirrors the web
/// `renderToday()`: New cards shuffles the pair, and memories already written
/// for this exact pairing collect below.
struct TodayView: View {
    private let sepia = Color(red: 0.478, green: 0.353, blue: 0.212)   // #7A5A36
    private let soft = Color(red: 0.420, green: 0.365, blue: 0.306)    // #6B5D4F
    private let nothingRed = Color(red: 0.753, green: 0.224, blue: 0.169) // #c0392b
    private let mauve = Color(red: 0.616, green: 0.420, blue: 0.478)   // lighter maroon / mauve #9D6C7A

    @ObservedObject private var curate = CurateStore.shared
    private var events: [XICard] { curate.keep(XIDeck.events, role: "ev") }
    private var twists: [XICard] { curate.keep(XIDeck.twists, role: "tw") }

    @State private var ev = 0
    @State private var tw = 0
    @State private var flip = "tw"
    @State private var hist: [(Int, Int)] = []
    /// Which day's pair is showing — ‹ › browse past days like Board of the Day.
    @State private var viewDay = BoardEngine.dayNumber()
    private var isToday: Bool { viewDay == BoardEngine.dayNumber() }

    @State private var text = ""
    @State private var saving = false
    @State private var saveError: String?
    @State private var memories: [XIMemory] = []
    @State private var totalCount = 0
    @State private var started = false
    @State private var showSettings = false
    @FocusState private var writing: Bool

    // Guard against a fully curated-away deck (would index [-1] and crash) by
    // falling back to the uncurated deck.
    private var safeEvents: [XICard] { events.isEmpty ? XIDeck.events : events }
    private var safeTwists: [XICard] { twists.isEmpty ? XIDeck.twists : twists }
    private var event: XICard { isToday ? safeEvents[min(ev, safeEvents.count - 1)] : pairForDay(viewDay).0 }
    private var twist: XICard { isToday ? safeTwists[min(tw, safeTwists.count - 1)] : pairForDay(viewDay).1 }
    private var pairKey: String { "\(event.id)__\(twist.id)" }

    /// Deterministic daily pairing (same walk the gallery used): event forward,
    /// twist backward.
    private func pairForDay(_ dn: Int) -> (XICard, XICard) {
        let ne = XIDeck.events.count, nt = XIDeck.twists.count
        let ei = ((dn % ne) + ne) % ne
        let ti = ((((nt - 1 - dn) % nt) + nt) % nt)
        return (XIDeck.events[ei], XIDeck.twists[ti])
    }

    @ObservedObject private var kb = KeyboardHeight.shared

    var body: some View {
        ScrollViewReader { proxy in
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header
                cardRow
                composer.id("composer")
                collected
                others
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            // The shell pins the nav by ignoring the keyboard's safe area, so
            // avoidance is manual here: pad by the keyboard height and scroll
            // the composer up above it while writing.
            .padding(.bottom, kb.height)
            .frame(maxWidth: 560)
            .frame(maxWidth: .infinity)
        }
        .onChange(of: kb.height) { h in
            if h > 0 && writing {
                withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo("composer", anchor: .bottom) }
            }
        }
        }
        .background(XITheme.paper.ignoresSafeArea())
        // Tapping anywhere outside the text box dismisses the keyboard.
        .onTapGesture { writing = false }
        .overlay(alignment: .topTrailing) {
            Button { showSettings = true } label: {
                Image(systemName: "gearshape").font(.system(size: 20)).foregroundStyle(soft)
            }
            .padding(.top, 20).padding(.trailing, 18)
        }
        .sheet(isPresented: $showSettings) { SettingsView() }
        .scrollDismissesKeyboard(.interactively)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { writing = false }
                    .font(.system(.body, design: .serif)).tint(XITheme.gold)
            }
        }
        .task { startIfNeeded(); await loadTotal() }
        .task(id: pairKey) { await reload() }
        .task(id: pairKey) {
            othersTexts = []
            othersTexts = await XIService.shared.generateOthers(
                pairKey: pairKey, eventCap: event.cap, twistCap: twist.cap) ?? []
        }
    }

    // MARK: header

    /// Title row with ‹ › day arrows (same pattern as Board of the Day); the
    /// redraw/undo controls sit on a row beneath, today only. The floating gear
    /// lives top-right (see the overlay).
    private var header: some View {
        VStack(spacing: 10) {
            HStack(spacing: 14) {
                // No lower bound past day 1; arrows never wipe in-progress text.
                Button { viewDay -= 1 } label: { Image(systemName: "chevron.left") }
                    .disabled(viewDay <= 1)
                Text("CARDS OF THE DAY")
                    .font(.system(.footnote, design: .monospaced)).foregroundStyle(XITheme.navInk)
                Button { if !isToday { viewDay += 1 } } label: { Image(systemName: "chevron.right") }
                    .disabled(isToday)
            }
            .font(.system(.subheadline))
            .tint(XITheme.gold)
            .frame(maxWidth: .infinity)
            // The XI wordmark lives top-left on every screen.
            .overlay(alignment: .leading) { XILogo(height: 22) }
            if isToday {
                HStack(spacing: 10) {
                    if !hist.isEmpty {
                        Button { undo() } label: { Image(systemName: "arrow.uturn.backward") }
                            .foregroundStyle(soft)
                    }
                    Spacer()
                    redrawButton
                    Spacer()
                    Color.clear.frame(width: hist.isEmpty ? 0 : 22, height: 1)
                }
            }
        }
        .padding(.bottom, 12)
    }

    private var redrawButton: some View {
        Button { newCards() } label: {
            Text("redraw")
                .font(.system(size: 13, design: .serif)).tracking(0.6)
                .foregroundStyle(XITheme.ink)
                .padding(.vertical, 6).padding(.horizontal, 14)
                .background(
                    LinearGradient(colors: [Color(red: 0.984, green: 0.953, blue: 0.878),
                                            Color(red: 0.949, green: 0.878, blue: 0.729)],
                                   startPoint: .top, endPoint: .bottom)
                )
                .clipShape(RoundedRectangle(cornerRadius: 6))
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(sepia, lineWidth: 1))
        }
    }

    // MARK: cards

    private var cardRow: some View {
        HStack(spacing: 10) {
            TodayCard(card: event, isEvent: true)
            TodayCard(card: twist, isEvent: false)
        }
    }

    // MARK: composer

    private var composer: some View {
        VStack(alignment: .leading, spacing: 10) {
            ZStack(alignment: .topLeading) {
                if text.isEmpty {
                    Text("A memory that's both of these…")
                        .font(.system(size: 16, design: .serif)).foregroundStyle(soft.opacity(0.7))
                        .padding(.horizontal, 14).padding(.vertical, 14)
                }
                // Fixed height so the editor scrolls INTERNALLY as you type —
                // the caret always stays visible instead of the box growing
                // past the bottom of the screen.
                TextEditor(text: $text)
                    .focused($writing)
                    .font(.system(size: 16, design: .serif)).foregroundStyle(XITheme.ink)
                    .frame(height: 120)
                    .scrollContentBackground(.hidden)
                    .padding(.horizontal, 9).padding(.vertical, 6)
            }
            .background(XITheme.white)
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(writing ? XITheme.gold : soft.opacity(0.7), lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 6))

            HStack(alignment: .center, spacing: 10) {
                // Never says zero: before your first memory of the day it shows
                // just the day's overall count; after, "1 memory collected / N".
                Group {
                    if totalCount == 0 {
                        Text("\(XIRobots.othersCollectedToday(day: BoardEngine.dayNumber())) memories collected")
                            .foregroundStyle(mauve)
                    } else {
                        HStack(spacing: 4) {
                            Text("\(totalCount) \(totalCount == 1 ? "memory" : "memories") collected")
                                .foregroundStyle(soft)
                            Text("/ \(totalCount + XIRobots.othersCollectedToday(day: BoardEngine.dayNumber()))")
                                .foregroundStyle(mauve)
                        }
                    }
                }
                .font(.system(size: 13, design: .serif).italic())
                Spacer()
                Button { Task { await save() } } label: {
                    // The original quiet save — ink on paper with a thin ink
                    // outline (reverted from gold/white at her request).
                    Text(saving ? "Saving…" : "Save")
                        .font(.system(size: 15, design: .serif)).tracking(0.5)
                        .foregroundStyle(XITheme.ink)
                        .padding(.vertical, 8).padding(.horizontal, 20)
                        .background(XITheme.paper)
                        .overlay(RoundedRectangle(cornerRadius: 6).stroke(XITheme.ink, lineWidth: 1))
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                }
                .disabled(saving || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .opacity(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.5 : 1)
            }
            if let saveError {
                Text(saveError).font(.footnote).foregroundStyle(.red)
            }
        }
        .padding(.top, 12)
    }

    // MARK: collected

    @ViewBuilder
    private var collected: some View {
        if !memories.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(memories) { m in
                    Text(m.content)
                        .font(.system(size: 15, design: .serif)).foregroundStyle(XITheme.ink)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 13).padding(.vertical, 11)
                        .background(XITheme.white)
                        .overlay(RoundedRectangle(cornerRadius: 4).stroke(XITheme.line))
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                }
            }
            .padding(.top, 12)
            .padding(.bottom, 30)
        }
    }

    // MARK: others (display-only — AI-written memories that combine BOTH of the
    // current cards, attributed to seeded personas. Never saved anywhere; if the
    // AI is unavailable, the section simply doesn't appear.)

    @State private var othersTexts: [String] = []

    @ViewBuilder
    private var others: some View {
        if !othersTexts.isEmpty {
            let authors = XIRobots.authors(for: pairKey, count: othersTexts.count)
            // Styled exactly like your own collected memories, with the writer's
            // name on top in a neutral color.
            VStack(alignment: .leading, spacing: 8) {
                ForEach(Array(othersTexts.enumerated()), id: \.offset) { i, text in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(authors[i])
                            .font(.system(size: 12, design: .serif)).foregroundStyle(soft)
                        Text(text)
                            .font(.system(size: 15, design: .serif)).foregroundStyle(XITheme.ink)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 13).padding(.vertical, 11)
                    .background(XITheme.white)
                    .overlay(RoundedRectangle(cornerRadius: 4).stroke(XITheme.line))
                    .clipShape(RoundedRectangle(cornerRadius: 4))
                }
            }
            .padding(.top, 18).padding(.bottom, 30)
        }
    }

    // MARK: logic

    private func startIfNeeded() {
        guard !started else { return }
        started = true
        ev = 0
        tw = max(0, twists.count - 1)
    }

    private func newCards() {
        // Redraws ONE card per tap, alternating twist then event — her explicit
        // preference (reverted from redrawing the pair).
        hist.append((ev, tw))
        let ne = safeEvents.count, nt = safeTwists.count
        if flip == "tw" {
            tw = (tw - 1 + nt) % nt; flip = "ev"
        } else {
            ev = (ev + 1) % ne; flip = "tw"
        }
        text = ""
    }

    private func undo() {
        guard let last = hist.popLast() else { return }
        ev = last.0; tw = last.1
        flip = (flip == "tw") ? "ev" : "tw"
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
            // Stamp the memory with the day actually being VIEWED, so writing on
            // a past day's pair doesn't get misattributed to today.
            try await XIService.shared.saveMemory(event: event, twist: twist, text: trimmed,
                                                  boardDay: viewDay, mode: "daily")
            text = ""
            writing = false
            await reload()
            await loadTotal()
        } catch {
            saveError = error.localizedDescription
        }
    }
}

/// A single Today card — line-art image multiplied over its cream/white tint.
private struct TodayCard: View {
    let card: XICard
    let isEvent: Bool

    var body: some View {
        ZStack {
            (isEvent ? XITheme.cream : XITheme.white)
            CardArt(card: card, capSize: 12, pad: 2)
        }
        .aspectRatio(1, contentMode: .fit)
        .frame(maxWidth: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: 4))
        .overlay(RoundedRectangle(cornerRadius: 4).stroke(XITheme.line, lineWidth: 0.5))
    }
}
