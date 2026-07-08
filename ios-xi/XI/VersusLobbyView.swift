import SwiftUI

enum VersusRecents {
    static let key = "xiVersusGames"
    static func list() -> [String] { (UserDefaults.standard.array(forKey: key) as? [String]) ?? [] }
    static func remember(_ id: String) {
        var l = list().filter { $0 != id }
        l.insert(id, at: 0)
        UserDefaults.standard.set(Array(l.prefix(12)), forKey: key)
    }
}

struct VersusLobbyView: View {
    @ObservedObject var auth: AuthState

    @State private var joinCode = ""
    @State private var busy = false
    @State private var error: String?
    @State private var path: [String] = []
    @State private var names: [String: String] = [:]   // gameId → other players' names
    @ObservedObject private var deepLink = XIDeepLink.shared

    var body: some View {
        NavigationStack(path: $path) {
            VStack(spacing: 22) {
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

                if !VersusRecents.list().isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("your games").font(.system(.footnote, design: .serif)).foregroundStyle(XITheme.gold)
                        ForEach(VersusRecents.list(), id: \.self) { id in
                            Button { path.append(id) } label: {
                                HStack {
                                    Text(names[id] ?? "game \(id)")
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
                if let n = await VersusService.shared.otherPlayerNames(gameId: id) { names[id] = n }
                busy = false
                if !path.contains(id) { path.append(id) }
            } catch { self.error = error.localizedDescription; busy = false }
        }
    }

    private func loadNames() async {
        for id in VersusRecents.list() where names[id] == nil {
            if let n = await VersusService.shared.otherPlayerNames(gameId: id) { names[id] = n }
        }
    }

    private func start() {
        busy = true; error = nil
        Task {
            do {
                let id = try await VersusService.shared.createGame()
                VersusRecents.remember(id)
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
                busy = false
                path.append(id)
            } catch { self.error = error.localizedDescription; busy = false }
        }
    }
}

/// A blurred, non-interactive mock of a game in progress — shown before you've
/// started anything so the empty state hints at what Versus feels like rather
/// than being a bare "start a game" button.
private struct VersusPreview: View {
    // A full board like the real Board of the Day — cream (event) / white (twist)
    // cards with faint captions — plus two players' claimed pairs framed in their
    // colours, the way a Versus game in progress actually looks.
    private let claims: [(Int, Int, String)] = [   // (cellA, cellB, colour) — adjacent pairs
        (6, 7, "#800020"), (12, 17, "#2c6e6e"), (18, 19, "#800020"), (8, 13, "#2c6e6e"),
    ]
    private let caps = [
        "a summer", "the call", "first frost", "we drove", "too much",
        "she knew", "the door", "late again", "almost", "the vow",
        "one more", "nowhere", "i meant it", "the edge", "unsaid",
        "goodbye", "the train", "held on", "the note", "after",
        "meant all", "the year", "possible", "said too", "and stayed",
    ]

    var body: some View {
        VStack(spacing: 10) {
            board
            fakeStory("#800020", "Ana", "the summer everything felt possible")
            fakeStory("#2c6e6e", "You", "times i said too much and meant all of it")
        }
        .padding(14)
        .background(XITheme.white.opacity(0.5))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(XITheme.line.opacity(0.5), lineWidth: 0.5))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .blur(radius: 2.6)
        .opacity(0.72)
        .overlay(
            Text("this is what a game looks like")
                .font(.system(.footnote, design: .serif).italic())
                .foregroundStyle(XITheme.gold)
        )
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private var board: some View {
        let cols = 5
        let spacing: CGFloat = 4
        return GeometryReader { geo in
            let cell = (geo.size.width - spacing * CGFloat(cols - 1)) / CGFloat(cols)
            ZStack(alignment: .topLeading) {
                VStack(spacing: spacing) {
                    ForEach(0..<5, id: \.self) { r in
                        HStack(spacing: spacing) {
                            ForEach(0..<cols, id: \.self) { c in
                                miniCell(r * cols + c, size: cell)
                            }
                        }
                    }
                }
                ForEach(Array(claims.enumerated()), id: \.offset) { _, claim in
                    claimFrame(claim, cell: cell, spacing: spacing)
                }
            }
        }
        .frame(width: 240, height: 240)
    }

    private func miniCell(_ idx: Int, size: CGFloat) -> some View {
        let isEvent = ((idx / 5) + (idx % 5)) % 2 == 0
        return RoundedRectangle(cornerRadius: 4)
            .fill(isEvent ? XITheme.cream : XITheme.white)
            .frame(width: size, height: size)
            .overlay(
                Text(caps[idx % caps.count])
                    .font(.system(size: 6.5, design: .serif))
                    .foregroundStyle(XITheme.ink.opacity(0.5))
                    .multilineTextAlignment(.center).padding(1.5)
            )
            .overlay(RoundedRectangle(cornerRadius: 4).stroke(XITheme.line, lineWidth: 0.5))
    }

    /// A player-coloured rectangle framing one claimed adjacent pair, sized and
    /// placed from the two cell indices (mirrors the game's pair frame).
    private func claimFrame(_ claim: (Int, Int, String), cell: CGFloat, spacing: CGFloat) -> some View {
        let cols = 5
        let (i, j) = (claim.0, claim.1)
        let minR = min(i / cols, j / cols), maxR = max(i / cols, j / cols)
        let minC = min(i % cols, j % cols), maxC = max(i % cols, j % cols)
        let x = CGFloat(minC) * (cell + spacing)
        let y = CGFloat(minR) * (cell + spacing)
        let w = CGFloat(maxC - minC + 1) * cell + CGFloat(maxC - minC) * spacing
        let h = CGFloat(maxR - minR + 1) * cell + CGFloat(maxR - minR) * spacing
        return RoundedRectangle(cornerRadius: 5)
            .stroke(Color(xiHex: claim.2), lineWidth: 2)
            .frame(width: w + 3, height: h + 3)
            .offset(x: x - 1.5, y: y - 1.5)
    }

    private func fakeStory(_ hex: String, _ who: String, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 6) {
            Circle().fill(Color(xiHex: hex)).frame(width: 8, height: 8).padding(.top, 3)
            VStack(alignment: .leading, spacing: 2) {
                Text(who).font(.system(.caption2, design: .serif, weight: .medium)).foregroundStyle(XITheme.ink)
                Text(text).font(.system(.caption, design: .serif)).foregroundStyle(XITheme.ink)
            }
            Spacer()
        }
        .padding(8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(XITheme.white)
        .overlay(RoundedRectangle(cornerRadius: 6).stroke(XITheme.line, lineWidth: 0.5))
    }
}
