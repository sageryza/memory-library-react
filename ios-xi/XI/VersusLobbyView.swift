import SwiftUI

enum VersusRecents {
    static let key = "xiVersusGames"
    static func list() -> [String] { (UserDefaults.standard.array(forKey: key) as? [String]) ?? [] }
    static func remember(_ id: String) {
        var l = list().filter { $0 != id }
        l.insert(id, at: 0)
        UserDefaults.standard.set(Array(l.prefix(12)), forKey: key)
    }
    static func forget(_ id: String) {
        UserDefaults.standard.set(list().filter { $0 != id }, forKey: key)
    }
}

struct VersusLobbyView: View {
    @ObservedObject var auth: AuthState

    @State private var busy = false
    @State private var error: String?
    @State private var path: [String] = []
    @State private var names: [String: String] = [:]   // gameId → other players' names
    @State private var namesLoaded: Set<String> = []    // games whose name fetch finished
    @State private var recents: [String] = VersusRecents.list()
    @State private var showInvite = false
    @ObservedObject private var deepLink = XIDeepLink.shared

    var body: some View {
        NavigationStack(path: $path) {
            VStack(spacing: 22) {
                Text("a memory game with friends")
                    .font(.system(.subheadline, design: .serif)).foregroundStyle(XITheme.gold)

                Button { showInvite = true } label: {
                    Text(busy ? "…" : "start a new game")
                        .font(.system(.body, design: .serif))
                        .frame(maxWidth: .infinity).padding(.vertical, 13)
                        .background(XITheme.gold).foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                }
                .disabled(busy)

                // Paste-a-link is retired: invites are tap-to-join universal
                // links now — tapping one lands here and joins on its own.
                if let error { Text(error).font(.footnote).foregroundStyle(.red) }
                if busy {
                    // Joining from a tapped invite (or starting a game) — show it.
                    ProgressView().tint(XITheme.gold)
                }

                if !recents.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("your games").font(.system(.footnote, design: .serif)).foregroundStyle(XITheme.gold)
                        ForEach(recents, id: \.self) { id in
                            Button { path.append(id) } label: {
                                HStack {
                                    // A game no one else has joined yet has no name to
                                    // show — say what it is, not a raw code. While the
                                    // name is still loading, stay neutral.
                                    Text(names[id] ?? (namesLoaded.contains(id) ? "waiting for a friend" : "…"))
                                        .font(.system(.body, design: .serif, weight: .medium))
                                    Spacer()
                                    Image(systemName: "chevron.right").font(.caption)
                                }
                                .foregroundStyle(XITheme.ink)
                                .padding(.vertical, 8).padding(.horizontal, 12)
                                .background(XITheme.white)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                                .overlay(RoundedRectangle(cornerRadius: 8).stroke(XITheme.line))
                            }
                        }
                    }
                    .padding(.top, 4)
                }
                // Always show the blurred preview of a game in progress, whether or
                // not you have games — it hints at what Versus feels like.
                VersusPreview().padding(.top, 6)

                Spacer()
            }
            .padding(24)
            .frame(maxWidth: 460)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .background(XITheme.paper.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                // App-wide title convention: ALL-CAPS typewriter, navInk; logo
                // top-left with the iOS 26 glass pill suppressed.
                ToolbarItem(placement: .principal) {
                    Text("VERSUS")
                        .font(.system(.footnote, design: .monospaced)).foregroundStyle(XITheme.navInk)
                }
                if #available(iOS 26.0, *) {
                    ToolbarItem(placement: .topBarLeading) { XILogo(height: 20) }
                        .sharedBackgroundVisibility(.hidden)
                } else {
                    ToolbarItem(placement: .topBarLeading) { XILogo(height: 20) }
                }
            }
            .navigationDestination(for: String.self) { gameId in
                VersusGameView(gameId: gameId, auth: auth)
            }
        }
        .tint(XITheme.gold)
        // "start a new game" opens the invite screen first — the game is
        // created there, with its players set up before it exists.
        .sheet(isPresented: $showInvite) {
            VersusInviteView { id in
                VersusRecents.remember(id)
                recents = VersusRecents.list()
                if !path.contains(id) { path.append(id) }
            }
        }
        // Load the other players' names for the "your games" list.
        .task { await loadNames() }
        // A shared Versus link joins the game and opens it (claiming the
        // tracked invite seat if the link carried a token).
        .task(id: deepLink.pendingVersusGameId) {
            guard let id = deepLink.pendingVersusGameId else { return }
            let token = deepLink.pendingVersusInviteToken
            deepLink.pendingVersusGameId = nil
            deepLink.pendingVersusInviteToken = nil
            busy = true; error = nil
            do {
                try await VersusService.shared.joinGame(id, inviteToken: token)
                VersusRecents.remember(id)
                recents = VersusRecents.list()
                if let n = await VersusService.shared.otherPlayerNames(gameId: id) { names[id] = n }
                busy = false
                if !path.contains(id) { path.append(id) }
            } catch { self.error = error.localizedDescription; busy = false }
        }
    }

    private func loadNames() async {
        var infos: [(id: String, s: VersusService.GameSummary)] = []
        for id in recents {
            switch await VersusService.shared.gameSummary(id) {
            case .none:
                // Network error — unknown; leave the row as-is, never prune.
                namesLoaded.insert(id)
            case .some(.none):
                // Doc is gone (deleted / expired) — prune from recents.
                VersusRecents.forget(id)
                recents.removeAll { $0 == id }
            case .some(.some(let s)):
                if let n = s.others { names[id] = n }
                namesLoaded.insert(id)
                infos.append((id, s))
            }
        }
        // Games waiting on YOUR move float to the top; then most recently
        // active. Quiet, forgotten games sink naturally — no forget button.
        let ordered = infos.sorted {
            if $0.s.yourTurn != $1.s.yourTurn { return $0.s.yourTurn }
            return $0.s.updatedAt > $1.s.updatedAt
        }.map(\.id)
        let known = Set(ordered)
        recents = ordered + recents.filter { !known.contains($0) }
    }

}

/// A blurred, non-interactive mock of a game in progress — the REAL board (actual
/// card art, mostly filled, a few cells marked with players' gold shapes as if
/// mid-play), then blurred. Shown before you've started so the empty state hints
/// at what Versus feels like rather than being a bare "start a game" button.
private struct VersusPreview: View {
    /// A blurred mock laid out like a real mid-play game — midjourney cards
    /// only (the default deck), so the preview matches what a new game deals.
    private static let layout: [(r: Int, c: Int, cap: String, owner: Int?)] = [
        (1, 2, "TOOK A GAMBLE", nil),
        (2, 1, "NOTHING TO DO BUT WAIT", nil),
        (2, 2, "WON THE HEART OF THE CROWD", nil),
        (2, 3, "TOOK BAD ADVICE", nil),
        (3, 2, "STOOD UP FOR THE CROWD", 1),
        (1, 1, "HAD A LITTLE TOO MUCH FUN", nil),
    ]

    private static func card(_ cap: String) -> XICard? {
        XIDeck.events.first { $0.cap.caseInsensitiveCompare(cap) == .orderedSame }
            ?? XIDeck.twists.first { $0.cap.caseInsensitiveCompare(cap) == .orderedSame }
    }

    var body: some View {
        // Same geometry as the real game board: 5pt gaps, empty cells showing,
        // plain background — just blurred.
        VStack(spacing: 5) {
            ForEach(0..<VersusModel.BR, id: \.self) { r in
                HStack(spacing: 5) {
                    ForEach(0..<VersusModel.BC, id: \.self) { c in
                        if let cell = Self.layout.first(where: { $0.r == r && $0.c == c }),
                           let card = Self.card(cell.cap) {
                            VersusCardCell(card: card, isEvent: (r + c) % 2 == 0,
                                           ownerOrder: cell.owner, anchored: false)
                        } else {
                            RoundedRectangle(cornerRadius: 4)
                                .fill(Color.black.opacity(0.025))
                                .aspectRatio(1, contentMode: .fit)
                        }
                    }
                }
            }
        }
        // The real board runs to 16pt screen margins; the lobby pads 24 — pull
        // back out so the preview matches the game's true width.
        .padding(.horizontal, -8)
        .blur(radius: 2.4)
        .opacity(0.8)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
