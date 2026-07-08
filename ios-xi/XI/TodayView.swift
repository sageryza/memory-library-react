import SwiftUI

/// "Card of the Day" — two cards (one event + one twist) drawn from the deck,
/// with a composer to write one memory that is both of them. Mirrors the web
/// `renderToday()`: New cards shuffles the pair, and memories already written
/// for this exact pairing collect below.
struct TodayView: View {
    private let sepia = Color(red: 0.478, green: 0.353, blue: 0.212)   // #7A5A36
    private let soft = Color(red: 0.420, green: 0.365, blue: 0.306)    // #6B5D4F
    private let nothingRed = Color(red: 0.753, green: 0.224, blue: 0.169) // #c0392b

    @ObservedObject private var curate = CurateStore.shared
    private var events: [XICard] { curate.keep(XIDeck.events) }
    private var twists: [XICard] { curate.keep(XIDeck.twists) }

    @State private var ev = 0
    @State private var tw = 0
    @State private var flip = "tw"
    @State private var hist: [(Int, Int)] = []

    @State private var text = ""
    @State private var saving = false
    @State private var memories: [XIMemory] = []
    @State private var totalCount = 0
    @State private var started = false
    @State private var showGallery = false
    @State private var showSettings = false
    @FocusState private var writing: Bool

    private var event: XICard { events[min(ev, events.count - 1)] }
    private var twist: XICard { twists[min(tw, twists.count - 1)] }
    private var pairKey: String { "\(event.id)__\(twist.id)" }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header
                cardRow
                composer
                collected
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .frame(maxWidth: 560)
            .frame(maxWidth: .infinity)
        }
        .background(XITheme.paper.ignoresSafeArea())
        .overlay(alignment: .topTrailing) {
            if !writing {
                HStack(spacing: 18) {
                    Button { showGallery = true } label: {
                        Image(systemName: "calendar").font(.system(size: 20)).foregroundStyle(soft)
                    }
                    Button { showSettings = true } label: {
                        Image(systemName: "gearshape").font(.system(size: 20)).foregroundStyle(soft)
                    }
                }
                .padding(.top, 20).padding(.trailing, 18)
            }
        }
        .sheet(isPresented: $showGallery) {
            GalleryView { ev, tw in usePair(ev, tw) }
        }
        .sheet(isPresented: $showSettings) { SettingsView() }
        .scrollDismissesKeyboard(.interactively)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Button("Done") { writing = false }
                    .font(.system(.body, design: .serif)).tint(XITheme.navInk)
                Spacer()
                Button(saving ? "Saving…" : "Save memory") { Task { await save() } }
                    .font(.system(.body, design: .serif).weight(.medium)).tint(XITheme.gold)
                    .disabled(saving || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .task { startIfNeeded(); await loadTotal() }
        .task(id: pairKey) { await reload() }
    }

    // MARK: header

    /// The logo and "New cards" sit on one row so the header isn't empty and the
    /// cards ride higher up the screen. The floating gear/calendar cluster lives
    /// top-right (see the overlay), so a little space is reserved on the right.
    private var header: some View {
        HStack(spacing: 10) {
            XILogo(height: 30)
            Spacer(minLength: 8)
            if !hist.isEmpty {
                Button { undo() } label: { Image(systemName: "arrow.uturn.backward") }
                    .foregroundStyle(soft)
            }
            newCardsButton
            Color.clear.frame(width: 56, height: 1)   // clears the floating gear/calendar
        }
        .padding(.bottom, 14)
    }

    private var newCardsButton: some View {
        HStack(spacing: 10) {
            Button { newCards() } label: {
                HStack(spacing: 6) {
                    Image(systemName: "sun.max").foregroundStyle(sepia)
                    Text("New cards").font(.system(size: 13, design: .serif)).tracking(0.6)
                        .foregroundStyle(XITheme.ink)
                }
                .padding(.vertical, 6).padding(.horizontal, 13)
                .background(
                    LinearGradient(colors: [Color(red: 0.984, green: 0.953, blue: 0.878),
                                            Color(red: 0.949, green: 0.878, blue: 0.729)],
                                   startPoint: .top, endPoint: .bottom)
                )
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(sepia, lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 6))
            }
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
                TextEditor(text: $text)
                    .focused($writing)
                    .font(.system(size: 16, design: .serif)).foregroundStyle(XITheme.ink)
                    .frame(minHeight: 96)
                    .scrollContentBackground(.hidden)
                    .padding(.horizontal, 9).padding(.vertical, 6)
            }
            .background(XITheme.white)
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(writing ? XITheme.gold : soft.opacity(0.7), lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 6))

            HStack(alignment: .center, spacing: 10) {
                if totalCount > 0 {
                    Text("\(totalCount) collected today")
                        .font(.system(size: 13, design: .serif).italic())
                        .foregroundStyle(soft)
                }
                Spacer()
                Button { Task { await save() } } label: {
                    Text(saving ? "Saving…" : "Save")
                        .font(.system(size: 15, design: .serif)).tracking(0.5)
                        .foregroundStyle(XITheme.ink)
                        .padding(.vertical, 8).padding(.horizontal, 20)
                        .background(XITheme.paper)
                        .overlay(RoundedRectangle(cornerRadius: 6).stroke(XITheme.ink, lineWidth: 1))
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                }
                .disabled(saving || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
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

    // MARK: logic

    private func startIfNeeded() {
        guard !started else { return }
        started = true
        ev = 0
        tw = max(0, twists.count - 1)
    }

    private func newCards() {
        hist.append((ev, tw))
        let ne = events.count, nt = twists.count
        if flip == "tw" { tw = (tw - 1 + nt) % nt; flip = "ev" }
        else { ev = (ev + 1) % ne; flip = "tw" }
        text = ""
    }

    private func undo() {
        guard let last = hist.popLast() else { return }
        ev = last.0; tw = last.1
        flip = flip == "tw" ? "ev" : "tw"
    }

    /// Load a pairing chosen in the gallery into Today.
    private func usePair(_ chosenEvent: XICard, _ chosenTwist: XICard) {
        hist.append((ev, tw))
        if let ei = events.firstIndex(where: { $0.id == chosenEvent.id }) { ev = ei }
        if let ti = twists.firstIndex(where: { $0.id == chosenTwist.id }) { tw = ti }
        text = ""
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
        saving = true
        defer { saving = false }
        do {
            try await XIService.shared.saveMemory(event: event, twist: twist, text: trimmed,
                                                  boardDay: BoardEngine.dayNumber(), mode: "daily")
            text = ""
            writing = false
            await reload()
            await loadTotal()
        } catch {
            // surfaced minimally for now; a memory failing to save is rare
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
            if let img = card.img, let url = URL(string: XITheme.cardArtBase + img) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFit().blendMode(.multiply)
                } placeholder: { Color.clear }
                .padding(2)
            } else {
                Text(card.cap)
                    .font(.system(size: 12, design: .serif)).multilineTextAlignment(.center)
                    .foregroundStyle(XITheme.ink).padding(6)
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .frame(maxWidth: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: 4))
        .overlay(RoundedRectangle(cornerRadius: 4).stroke(XITheme.line, lineWidth: 0.5))
    }
}
