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
                                    Text(id).font(.system(.body, design: .serif, weight: .medium))
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
                } else {
                    VersusPreview().padding(.top, 6)
                }

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
        let id = code.trimmingCharacters(in: .whitespaces)
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
    // A little checkerboard with a scatter of "placed" cards in two players'
    // colours, plus a couple of ghosted story rows.
    private let filled: Set<Int> = [0, 2, 5, 7, 8, 12, 13, 15, 18, 20, 22]
    private let owners: [Int: Color] = [
        5: Color(xiHex: "#800020"), 7: Color(xiHex: "#2c6e6e"),
        12: Color(xiHex: "#800020"), 13: Color(xiHex: "#2c6e6e"), 18: Color(xiHex: "#800020"),
    ]

    var body: some View {
        VStack(spacing: 10) {
            VStack(spacing: 4) {
                ForEach(0..<5, id: \.self) { r in
                    HStack(spacing: 4) {
                        ForEach(0..<5, id: \.self) { c in
                            let idx = r * 5 + c
                            let isEvent = (r + c) % 2 == 0
                            RoundedRectangle(cornerRadius: 4)
                                .fill(filled.contains(idx)
                                      ? (isEvent ? XITheme.cream : XITheme.white)
                                      : Color.black.opacity(0.03))
                                .aspectRatio(1, contentMode: .fit)
                                .overlay(RoundedRectangle(cornerRadius: 4)
                                    .stroke(owners[idx] ?? XITheme.line,
                                            lineWidth: owners[idx] != nil ? 2 : 0.5))
                        }
                    }
                }
            }
            .frame(maxWidth: 240)

            fakeStory("#800020", "Ana", "the summer everything felt possible")
            fakeStory("#2c6e6e", "You", "times i said too much and meant all of it")
        }
        .padding(14)
        .background(XITheme.white.opacity(0.5))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(XITheme.line.opacity(0.5), lineWidth: 0.5))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .blur(radius: 3)
        .opacity(0.6)
        .overlay(
            Text("this is what a game looks like")
                .font(.system(.footnote, design: .serif).italic())
                .foregroundStyle(XITheme.gold)
        )
        .allowsHitTesting(false)
        .accessibilityHidden(true)
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
