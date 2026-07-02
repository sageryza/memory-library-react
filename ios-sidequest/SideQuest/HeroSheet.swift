import SwiftUI

/// Edit the hero identity that appears on Hall of Absurdity posts.
struct HeroSheet: View {
    @EnvironmentObject var game: GameState
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var avatar = ""

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 10), count: 4)

    var body: some View {
        ZStack {
            SQ.background.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 18) {
                    Text("YOUR HERO").font(SQ.pixel(18)).foregroundStyle(SQ.gold).padding(.top, 12)
                    Text("How the Hall of Absurdity will know you.")
                        .font(SQ.term(20)).foregroundStyle(.white.opacity(0.75))

                    PixelPanel {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("QUEST NAME").font(SQ.pixel(9)).foregroundStyle(.white.opacity(0.5))
                            TextField("", text: $name, prompt: Text("Sir Rindsworth…").foregroundColor(.white.opacity(0.35)))
                                .font(SQ.term(24)).foregroundStyle(.white)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .padding(10)
                                .background(.black.opacity(0.3))
                                .overlay(Rectangle().stroke(.white.opacity(0.3), lineWidth: 2))
                                .onChange(of: name) { v in if v.count > 20 { name = String(v.prefix(20)) } }
                        }
                    }

                    PixelPanel {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("AVATAR").font(SQ.pixel(9)).foregroundStyle(.white.opacity(0.5))
                            LazyVGrid(columns: columns, spacing: 10) {
                                ForEach(GameState.avatars, id: \.self) { a in
                                    Button { avatar = a } label: {
                                        Text(a).font(.system(size: 34))
                                            .frame(maxWidth: .infinity).frame(height: 56)
                                            .background(avatar == a ? SQ.panelHi : .black.opacity(0.25))
                                            .overlay(Rectangle().stroke(avatar == a ? SQ.gold : .white.opacity(0.15),
                                                                        lineWidth: avatar == a ? 3 : 2))
                                    }
                                }
                            }
                        }
                    }

                    Button("✓ SAVE HERO") {
                        game.setHero(username: name, avatar: avatar)
                        dismiss()
                    }
                    .buttonStyle(PixelButton(bg: SQ.green))
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                    Button("cancel") { dismiss() }
                        .font(SQ.term(20)).foregroundStyle(.white.opacity(0.6))
                    Spacer(minLength: 10)
                }
                .padding(16)
                .frame(maxWidth: 480)
                .frame(maxWidth: .infinity)
            }
        }
        .onAppear { name = game.username; avatar = game.avatar }
    }
}
