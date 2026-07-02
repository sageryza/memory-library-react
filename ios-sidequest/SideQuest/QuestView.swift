import SwiftUI

struct QuestView: View {
    @EnvironmentObject var game: GameState
    @EnvironmentObject var feed: FeedService
    @State private var submitting = false
    @State private var success: Int?      // xp gained, drives success sheet

    private var activeQuest: Quest? {
        guard let id = game.activeQuestId else { return nil }
        return Quests.all.first { $0.id == id }
    }

    var body: some View {
        ZStack {
            SQ.background.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 20) {
                    if let q = activeQuest {
                        active(q)
                    } else if game.didTodayQuest {
                        PixelPanel(border: SQ.teal) {
                            Text("Quest complete.\nThe void is satisfied… for now.")
                                .font(SQ.term(22)).foregroundStyle(.white)
                                .multilineTextAlignment(.center).frame(maxWidth: .infinity)
                        }
                    } else {
                        QuestCard(quest: Quests.today())
                        Button("⚔ ACCEPT QUEST ⚔") { game.accept(Quests.today()) }
                            .buttonStyle(PixelButton(bg: SQ.green))
                    }
                    Spacer(minLength: 20)
                }
                .padding(16)
                .frame(maxWidth: 480)
                .frame(maxWidth: .infinity)
            }
        }
        .sheet(isPresented: $submitting) {
            if let q = activeQuest {
                SubmissionView(quest: q) { story, image in
                    game.complete(q, story: story, image: image)
                    feed.post(quest: q, story: story, image: image,
                              username: game.username, avatar: game.avatar)
                    success = q.xp
                }
            }
        }
        .sheet(item: Binding(get: { success.map { XPGain(xp: $0) } }, set: { success = $0?.xp })) { g in
            SuccessView(xp: g.xp)
        }
    }

    private struct XPGain: Identifiable { let xp: Int; var id: Int { xp } }

    @ViewBuilder private func active(_ q: Quest) -> some View {
        QuestCard(quest: q)
        TimelineView(.periodic(from: .now, by: 1)) { _ in
            let left = game.remaining(for: q) ?? 0
            PixelPanel(border: left == 0 ? SQ.coral : SQ.teal) {
                VStack(spacing: 8) {
                    Text(left == 0 ? "TIME'S UP" : "TIME REMAINING")
                        .font(SQ.pixel(10)).foregroundStyle(.white.opacity(0.6))
                    Text(clock(left)).font(SQ.pixel(28))
                        .foregroundStyle(left == 0 ? SQ.coral : SQ.teal)
                }
                .frame(maxWidth: .infinity)
            }
        }
        Button("✓ COMPLETE QUEST") { submitting = true }
            .buttonStyle(PixelButton(bg: SQ.green))
        Button("✗ FLEE THE QUEST") { game.abandon() }
            .buttonStyle(PixelButton(bg: SQ.coral))
    }

    private func clock(_ s: Int) -> String {
        let h = s / 3600, m = (s % 3600) / 60, sec = s % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, sec) : String(format: "%02d:%02d", m, sec)
    }
}
