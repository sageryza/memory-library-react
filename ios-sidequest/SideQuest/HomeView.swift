import SwiftUI

struct HomeView: View {
    var goToQuest: () -> Void
    @EnvironmentObject var game: GameState
    @State private var showHero = false
    private var quest: Quest { Quests.today() }

    var body: some View {
        ZStack {
            SQ.background.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 20) {
                    title
                    heroRow
                    XPBar()
                    WaitingRoom()
                    QuestCard(quest: quest)
                    actionArea
                    Spacer(minLength: 20)
                }
                .padding(16)
                .frame(maxWidth: 480)
                .frame(maxWidth: .infinity)
            }
        }
        .sheet(isPresented: $showHero) { HeroSheet() }
    }

    /// Tappable hero card — the identity shown on Hall posts.
    private var heroRow: some View {
        Button { showHero = true } label: {
            PixelPanel(fill: SQ.panelHi, border: .white.opacity(0.25)) {
                HStack(spacing: 12) {
                    Text(game.avatar).font(.system(size: 34))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(game.username).font(SQ.pixel(11)).foregroundStyle(SQ.gold)
                        Text("your hero — tap to edit").font(SQ.term(17)).foregroundStyle(.white.opacity(0.6))
                    }
                    Spacer()
                    Image(systemName: "pencil").foregroundStyle(.white.opacity(0.5))
                }
            }
        }
        .buttonStyle(.plain)
    }

    private var title: some View {
        VStack(spacing: 8) {
            Text("SIDE QUEST")
                .font(SQ.pixel(26)).foregroundStyle(SQ.gold)
                .shadow(color: SQ.gold.opacity(0.7), radius: 8)
                .multilineTextAlignment(.center)
            Text("Find Purpose in Purposelessness")
                .font(SQ.term(20)).foregroundStyle(.white.opacity(0.85))
        }
        .padding(.top, 8)
    }

    @ViewBuilder private var actionArea: some View {
        if game.didTodayQuest {
            PixelPanel(border: SQ.teal) {
                Text("You found purpose today.\nReturn tomorrow, NPC.")
                    .font(SQ.term(22)).foregroundStyle(.white)
                    .multilineTextAlignment(.center).frame(maxWidth: .infinity)
            }
        } else if game.activeQuestId != nil {
            Button("◈ QUEST IN PROGRESS ◈", action: goToQuest)
                .buttonStyle(PixelButton(bg: SQ.teal, fg: SQ.panel))
        } else {
            Button("⚔ ACCEPT QUEST ⚔") { game.accept(quest); goToQuest(); Notifications.enable() }
                .buttonStyle(PixelButton(bg: SQ.green))
        }
    }
}

struct XPBar: View {
    @EnvironmentObject var game: GameState
    var body: some View {
        PixelPanel {
            VStack(spacing: 10) {
                HStack {
                    Text("LVL \(game.level)").font(SQ.pixel(12)).foregroundStyle(SQ.gold)
                    Spacer()
                    Text("🔥 \(game.streak)").font(SQ.term(22)).foregroundStyle(SQ.coral)
                }
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Rectangle().fill(.black.opacity(0.35))
                        Rectangle().fill(SQ.gold)
                            .frame(width: geo.size.width * CGFloat(game.xpIntoLevel) / 1000)
                    }
                    .overlay(Rectangle().stroke(.white.opacity(0.3), lineWidth: 2))
                }
                .frame(height: 18)
                Text("\(game.xpIntoLevel) / 1000 XP").font(SQ.term(18)).foregroundStyle(.white.opacity(0.8))
            }
        }
    }
}

/// The Existential Waiting Room — NPCs wander and mutter when tapped.
struct WaitingRoom: View {
    private let npcs: [(emoji: String, line: String)] = [
        ("🧍", "What... what do I even do now?"),
        ("🧍‍♀️", "The AI does everything. I just... wait."),
        ("🧎", "Is there a quest? Please say there's a quest."),
    ]
    @State private var wander = false
    @State private var speaking: Int?

    var body: some View {
        PixelPanel(fill: SQ.panelHi, border: .white.opacity(0.25)) {
            VStack(spacing: 6) {
                Text("THE WAITING ROOM").font(SQ.pixel(9)).foregroundStyle(.white.opacity(0.6))
                HStack(spacing: 24) {
                    ForEach(npcs.indices, id: \.self) { i in
                        VStack(spacing: 4) {
                            if speaking == i {
                                Text(npcs[i].line).font(SQ.term(16)).foregroundStyle(SQ.panel)
                                    .padding(6).background(.white).overlay(Rectangle().stroke(.black, lineWidth: 2))
                                    .frame(width: 110)
                            }
                            Text(npcs[i].emoji).font(.system(size: 40))
                                .offset(y: wander ? -6 : 6)
                                .animation(.easeInOut(duration: 1.4 + Double(i) * 0.3).repeatForever(autoreverses: true), value: wander)
                                .onTapGesture { withAnimation { speaking = (speaking == i ? nil : i) } }
                        }
                        .frame(height: 96, alignment: .bottom)
                    }
                }
            }
            .frame(maxWidth: .infinity)
        }
        .onAppear { wander = true }
    }
}

/// The shared quest card.
struct QuestCard: View {
    let quest: Quest
    var body: some View {
        PixelPanel {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("TODAY'S QUEST").font(SQ.pixel(9)).foregroundStyle(.white.opacity(0.5))
                    Spacer()
                    Text(quest.difficulty.rawValue).font(SQ.pixel(9)).foregroundStyle(SQ.panel)
                        .padding(.vertical, 5).padding(.horizontal, 8)
                        .background(quest.difficulty.color)
                }
                Text(quest.title).font(SQ.pixel(15)).foregroundStyle(SQ.gold)
                    .fixedSize(horizontal: false, vertical: true)
                Text(quest.description).font(SQ.term(21)).foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)
                HStack {
                    Label(quest.timeLimitDisplay, systemImage: "clock").font(SQ.term(19)).foregroundStyle(SQ.teal)
                    Spacer()
                    Text("+\(quest.xp) XP").font(SQ.pixel(12)).foregroundStyle(SQ.gold)
                }
            }
        }
    }
}
