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
    @State private var started = false
    @FocusState private var writing: Bool

    private var event: XICard { events[min(ev, events.count - 1)] }
    private var twist: XICard { twists[min(tw, twists.count - 1)] }
    private var pairKey: String { "\(event.id)__\(twist.id)" }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                brand
                topBar
                cardRow
                composer
                collected
            }
            .padding(.horizontal, 16)
            .padding(.top, 18)
            .frame(maxWidth: 560)
            .frame(maxWidth: .infinity)
        }
        .background(XITheme.paper.ignoresSafeArea())
        .task { startIfNeeded() }
        .task(id: pairKey) { await reload() }
    }

    // MARK: header

    private var brand: some View {
        Text("XI")
            .font(.system(.title2, design: .serif).weight(.semibold)).tracking(6)
            .foregroundStyle(XITheme.ink)
            .padding(.bottom, 14)
    }

    private var topBar: some View {
        HStack(spacing: 10) {
            if !hist.isEmpty {
                Button { undo() } label: { Image(systemName: "arrow.uturn.backward") }
                    .foregroundStyle(soft)
            }
            Spacer()
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
            Spacer()
            // keeps the New cards button visually centered
            Color.clear.frame(width: hist.isEmpty ? 0 : 22, height: 1)
        }
        .padding(.bottom, 16)
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
        VStack(alignment: .trailing, spacing: 10) {
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
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(writing ? XITheme.maroon : soft.opacity(0.7), lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 6))

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
        .padding(.top, 12)
    }

    // MARK: collected

    @ViewBuilder
    private var collected: some View {
        if !memories.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("\(memories.count) \(memories.count == 1 ? "memory" : "memories") collected")
                    .font(.system(size: 13, design: .serif).italic()).foregroundStyle(soft)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.top, 18).padding(.bottom, 4)
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

    private func reload() async {
        memories = await XIService.shared.memories(pairKey: pairKey)
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
                .padding(6)
            } else {
                Text(card.cap)
                    .font(.system(size: 12, design: .serif)).multilineTextAlignment(.center)
                    .foregroundStyle(XITheme.ink).padding(8)
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .frame(maxWidth: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: 4))
        .overlay(RoundedRectangle(cornerRadius: 4).stroke(XITheme.line, lineWidth: 0.5))
    }
}
