import SwiftUI

/// A pairing of two orthogonally-adjacent board cards (always one event + one twist).
struct Pairing: Identifiable {
    let event: XICard
    let twist: XICard
    var id: String { "\(event.id)__\(twist.id)" }
}

/// Collects the bounds of the framed board cells so we can draw ONE merged
/// rectangle around the chosen pair (matching the web's `xiv-pairframe`), rather
/// than a separate square per card.
private struct FrameAnchorKey: PreferenceKey {
    static var defaultValue: [Anchor<CGRect>] = []
    static func reduce(value: inout [Anchor<CGRect>], nextValue: () -> [Anchor<CGRect>]) {
        value.append(contentsOf: nextValue())
    }
}

struct BoardView: View {
    @ObservedObject var auth: AuthState

    @State private var viewDay = BoardEngine.dayNumber()
    @State private var selected: Cell?
    @State private var composedCells: [Cell] = []   // the pair highlighted while composing
    @State private var composing: Pairing?
    @State private var showHelp = false
    @State private var showDeleteConfirm = false
    @State private var deleteError: String?
    @State private var showBlocked = false

    private struct Cell: Equatable { let r: Int; let c: Int }

    private var today: Int { BoardEngine.dayNumber() }
    private var isToday: Bool { viewDay == today }
    private var placed: [Placed] { BoardEngine.dailyBoard(viewDay) }
    private var rows: Int { (placed.map { $0.r }.max() ?? 4) + 1 }
    private var cols: Int { (placed.map { $0.c }.max() ?? 4) + 1 }
    private var byCell: [String: Placed] {
        Dictionary(uniqueKeysWithValues: placed.map { ("\($0.r),\($0.c)", $0) })
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                header
                board
                    .frame(maxWidth: min(520, CGFloat(cols) * 130))
                if !isToday {
                    Text("Past board — view only. Tap › to come back to today.")
                        .font(.system(.footnote, design: .serif))
                        .foregroundStyle(XITheme.line)
                        .multilineTextAlignment(.center)
                        .padding(.top, 4)
                }
                Spacer()
            }
            .padding(16)
            .frame(maxWidth: 520)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .background(XITheme.paper.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { showHelp = true } label: {
                        Image(systemName: "info.circle").tint(XITheme.gold)
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        if let email = auth.email {
                            Text(email)
                        } else if auth.isAnonymous {
                            Text("playing without an account")
                        }
                        Button("manage blocked players") { showBlocked = true }
                        Button("sign out", role: .destructive) { try? XIService.shared.signOut() }
                        Button("delete account", role: .destructive) { showDeleteConfirm = true }
                    } label: {
                        Image(systemName: "person.circle").tint(XITheme.gold)
                    }
                }
            }
            .sheet(item: $composing) { pair in
                ComposerSheet(pairing: pair, boardDay: viewDay)
            }
            .sheet(isPresented: $showHelp) { BoardHelpSheet() }
            .sheet(isPresented: $showBlocked) { BlockedUsersView() }
            .confirmationDialog("Delete your account?", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
                Button("Delete account and all my data", role: .destructive) {
                    Task {
                        do { try await XIService.shared.deleteAccount() }
                        catch { deleteError = error.localizedDescription }
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This permanently deletes your account and all your saved memories and boards. This can't be undone.")
            }
            .alert("Couldn't delete account", isPresented: .constant(deleteError != nil)) {
                Button("OK") { deleteError = nil }
            } message: {
                Text(deleteError ?? "")
            }
            .onChange(of: composing?.id) { newID in
                if newID == nil { composedCells = [] }   // composer closed → clear the pair
            }
        }
        .tint(XITheme.gold)
    }

    private var header: some View {
        HStack {
            Button { viewDay -= 1; selected = nil; composedCells = [] } label: { Image(systemName: "chevron.left") }
            Spacer()
            VStack(spacing: 2) {
                Text("XI")
                    .font(.system(.title2, design: .serif).weight(.semibold)).tracking(6)
                    .foregroundStyle(XITheme.ink)
                Text(BoardEngine.dayLabel(viewDay, today: today))
                    .font(.system(.subheadline, design: .serif)).foregroundStyle(XITheme.gold)
            }
            Spacer()
            Button { if viewDay < today { viewDay += 1; selected = nil; composedCells = [] } } label: { Image(systemName: "chevron.right") }
                .disabled(viewDay >= today)
        }
        .font(.system(.title3, design: .serif))
        .tint(XITheme.gold)
        .padding(.horizontal, 4)
    }

    private var board: some View {
        VStack(spacing: 5) {
            ForEach(0..<rows, id: \.self) { r in
                HStack(spacing: 5) {
                    ForEach(0..<cols, id: \.self) { c in
                        cell(r, c)
                    }
                }
            }
        }
        // One merged gold rectangle around the chosen card(s): a single cell after
        // the first tap, growing into a rectangle spanning the pair after the
        // second — mirrors the web's `xiv-pairframe`.
        .overlayPreferenceValue(FrameAnchorKey.self) { anchors in
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
        let cell = Cell(r: r, c: c)
        if let p = byCell["\(r),\(c)"] {
            let isEvent = p.d == "be"
            let card = isEvent ? XIDeck.events[p.i] : XIDeck.twists[p.i]
            let framed = selected == cell || composedCells.contains(cell)
            CardCell(card: card, isEvent: isEvent)
                .anchorPreference(key: FrameAnchorKey.self, value: .bounds) {
                    framed ? [$0] : []
                }
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
        composedCells = [sel, here]     // keep both cards highlighted while composing
        composing = Pairing(event: ev, twist: tw)
        selected = nil
    }
}

struct CardCell: View {
    let card: XICard
    let isEvent: Bool

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
                .stroke(XITheme.line, lineWidth: 0.5)
        )
    }
}

/// The tap-to-open "how to play" panel for Board of the Day, matching the web's
/// `XiInfo` popover — instructions live behind the ⓘ instead of always on screen.
private struct BoardHelpSheet: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    help("Each day everyone gets the **same** board — a little crossword of memory cards.")
                    help("Tap **two touching cards** to write a memory that's both of them (\u{201C}times i\u{2026}\u{201D}). Every neighbouring pair makes a prompt.")
                    help("You can write as many memories on a pairing as you like — they're saved to your library.")
                    help("Use the **\u{2039} \u{203A}** arrows up top to revisit past days' boards.")
                }
                .padding(20)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(XITheme.paper.ignoresSafeArea())
            .navigationTitle("How to play")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }.tint(XITheme.gold)
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
