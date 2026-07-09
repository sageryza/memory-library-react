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

    @State private var joinCode = ""
    @State private var busy = false
    @State private var error: String?
    @State private var path: [String] = []
    @State private var names: [String: String] = [:]   // gameId → other players' names
    @State private var recents: [String] = VersusRecents.list()
    @ObservedObject private var deepLink = XIDeepLink.shared

    var body: some View {
        NavigationStack(path: $path) {
            VStack(spacing: 22) {
                XILogo(height: 22)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text("Versus")
                    .font(.system(.largeTitle, design: .serif).weight(.semibold)).tracking(4)
                    .foregroundStyle(XITheme.ink)
                Text("a memory game with friends")
                    .font(.system(.subheadline, design: .serif)).foregroundStyle(XITheme.gold)

                Button(action: start) {
                    Text(busy ? "…" : "start a new game")
                        .font(.system(.body, design: .serif))
                        .frame(maxWidth: .infinity).padding(.vertical, 13)
                        .background(XITheme.gold).foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .disabled(busy)

                HStack(spacing: 8) {
                    TextField("game code", text: $joinCode)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        .font(.system(.body, design: .serif))
                        .padding(12)
                        .background(XITheme.white)
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(XITheme.line))
                    Button("join") { join(joinCode) }
                        .font(.system(.body, design: .serif)).tint(XITheme.gold)
                        .disabled(joinCode.trimmingCharacters(in: .whitespaces).isEmpty || busy)
                }

                if let error { Text(error).font(.footnote).foregroundStyle(.red) }

                if !recents.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("your games").font(.system(.footnote, design: .serif)).foregroundStyle(XITheme.gold)
                        ForEach(recents, id: \.self) { id in
                            Button { path.append(id) } label: {
                                HStack {
                                    // A game no one else has joined yet has no name to
                                    // show — say what it is, not a raw code.
                                    Text(names[id] ?? "waiting for a friend")
                                        .font(.system(.body, design: .serif, weight: .medium))
                                    Spacer()
                                    Image(systemName: "chevron.right").font(.caption)
                                }
                                .foregroundStyle(XITheme.ink)
                                .padding(.vertical, 8).padding(.horizontal, 12)
                                .background(XITheme.white)
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
            .navigationDestination(for: String.self) { gameId in
                VersusGameView(gameId: gameId, auth: auth)
            }
        }
        .tint(XITheme.gold)
        // Load the other players' names for the "your games" list.
        .task { await loadNames() }
        // A shared Versus link joins the game and opens it.
        .task(id: deepLink.pendingVersusGameId) {
            guard let id = deepLink.pendingVersusGameId else { return }
            deepLink.pendingVersusGameId = nil
            busy = true; error = nil
            do {
                try await VersusService.shared.joinGame(id)
                VersusRecents.remember(id)
                recents = VersusRecents.list()
                if let n = await VersusService.shared.otherPlayerNames(gameId: id) { names[id] = n }
                busy = false
                if !path.contains(id) { path.append(id) }
            } catch { self.error = error.localizedDescription; busy = false }
        }
    }

    private func loadNames() async {
        for id in recents {
            // Prune games whose document is gone (deleted / expired) so the list
            // only shows games you can actually reopen.
            guard await VersusService.shared.gameExists(id) else {
                VersusRecents.forget(id)
                recents.removeAll { $0 == id }
                continue
            }
            if names[id] == nil,
               let n = await VersusService.shared.otherPlayerNames(gameId: id) { names[id] = n }
        }
    }

    private func start() {
        busy = true; error = nil
        Task {
            do {
                let id = try await VersusService.shared.createGame()
                VersusRecents.remember(id)
                recents = VersusRecents.list()
                busy = false
                path.append(id)
            } catch { self.error = error.localizedDescription; busy = false }
        }
    }

    private func join(_ code: String) {
        var id = code.trimmingCharacters(in: .whitespaces)
        // Accept a pasted "…/versus/{id}" link as well as a bare code.
        if id.contains("/"), let url = URL(string: id),
           let parsed = XIDeepLink.parse(url), parsed.kind == "versus" {
            id = parsed.id
        }
        guard !id.isEmpty else { return }
        busy = true; error = nil
        Task {
            do {
                try await VersusService.shared.joinGame(id)
                VersusRecents.remember(id)
                recents = VersusRecents.list()
                busy = false
                path.append(id)
            } catch { self.error = error.localizedDescription; busy = false }
        }
    }
}

/// A blurred, non-interactive mock of a game in progress — the REAL board (actual
/// card art, mostly filled, a few cells marked with players' gold shapes as if
/// mid-play), then blurred. Shown before you've started so the empty state hints
/// at what Versus feels like rather than being a bare "start a game" button.
private struct VersusPreview: View {
    /// Mid-game crossword like a real Versus board: a vertical spine, a run
    /// crossing it, and one offshoot — the rest stay blank like Scrabble.
    private static let filled: Set<Int> = [2, 7, 12, 17, 22, 10, 11, 13, 14, 16]
    private let owners: [Int: Int] = [7: 0, 11: 1, 13: 1, 16: 1, 17: 0]  // cell → player order

    var body: some View {
        // Same geometry as the real game board (5pt gaps, full width, plain
        // background) so it reads as an actual game, just blurred.
        VStack(spacing: 5) {
            ForEach(0..<5, id: \.self) { r in
                HStack(spacing: 5) {
                    ForEach(0..<5, id: \.self) { c in
                        let idx = r * 5 + c
                        if Self.filled.contains(idx) {
                            let isEvent = (r + c) % 2 == 0
                            let deck = isEvent ? XIDeck.events : XIDeck.twists
                            VersusCardCell(card: deck[idx % deck.count], isEvent: isEvent,
                                           ownerOrder: owners[idx], anchored: false)
                        } else {
                            RoundedRectangle(cornerRadius: 4)
                                .fill(Color.black.opacity(0.025))
                                .aspectRatio(1, contentMode: .fit)
                        }
                    }
                }
            }
        }
        .blur(radius: 2.4)
        .opacity(0.8)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
