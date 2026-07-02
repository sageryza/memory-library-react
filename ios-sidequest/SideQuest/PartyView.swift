import SwiftUI

struct PartyView: View {
    @EnvironmentObject var game: GameState
    @EnvironmentObject var feed: FeedService
    @EnvironmentObject var svc: PartyService

    var body: some View {
        ZStack {
            SQ.background.ignoresSafeArea()
            if let party = svc.party {
                PartyRoom(party: party)
            } else if svc.phase == .searching {
                searching
            } else {
                PartySetup()
            }
        }
    }

    private var searching: some View {
        ScrollView {
            VStack(spacing: 20) {
                Text("SEEKING PARTY").font(SQ.pixel(18)).foregroundStyle(SQ.gold).padding(.top, 20)
                PixelPanel {
                    VStack(spacing: 12) {
                        SearchingNPCs()
                        Text("Scanning \(game.city) for heroes…")
                            .font(SQ.term(22)).foregroundStyle(.white)
                        Text(svc.waitingNearby > 0
                             ? "\(svc.waitingNearby) other hero\(svc.waitingNearby == 1 ? "" : "es") nearby"
                             : "You're first in line. Recruit a friend?")
                            .font(SQ.term(19)).foregroundStyle(SQ.teal)
                    }
                    .frame(maxWidth: .infinity)
                }
                Text("The moment another hero searches in \(game.city),\nyou'll be bound into a party.")
                    .font(SQ.term(19)).foregroundStyle(.white.opacity(0.6))
                    .multilineTextAlignment(.center)
                Button("✗ STOP SEARCHING") { svc.cancelSearch() }
                    .buttonStyle(PixelButton(bg: SQ.coral))
                Spacer(minLength: 20)
            }
            .padding(16)
            .frame(maxWidth: 480)
            .frame(maxWidth: .infinity)
        }
    }
}

/// Bouncing question-mark NPCs while matchmaking.
private struct SearchingNPCs: View {
    @State private var bounce = false
    var body: some View {
        HStack(spacing: 22) {
            ForEach(0..<3, id: \.self) { i in
                Text(["🧍", "❓", "🧍‍♀️"][i]).font(.system(size: 38))
                    .offset(y: bounce ? -7 : 7)
                    .animation(.easeInOut(duration: 1.1 + Double(i) * 0.25).repeatForever(autoreverses: true),
                               value: bounce)
            }
        }
        .onAppear { bounce = true }
    }
}

// MARK: - Setup (pick a city, see who's waiting, go)

private struct PartySetup: View {
    @EnvironmentObject var game: GameState
    @EnvironmentObject var svc: PartyService
    @StateObject private var finder = CityFinder()
    @State private var city = ""

    private var ready: Bool { !city.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                Text("PARTY QUEST").font(SQ.pixel(20)).foregroundStyle(SQ.gold).padding(.top, 16)
                Text("Get matched with a stranger in your city.\nGet one quest. Do it together.")
                    .font(SQ.term(21)).foregroundStyle(.white.opacity(0.85))
                    .multilineTextAlignment(.center)

                PixelPanel {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("YOUR CITY").font(SQ.pixel(9)).foregroundStyle(.white.opacity(0.5))
                        TextField("", text: $city,
                                  prompt: Text("Portland…").foregroundColor(.white.opacity(0.35)))
                            .font(SQ.term(24)).foregroundStyle(.white)
                            .autocorrectionDisabled()
                            .padding(10)
                            .background(.black.opacity(0.3))
                            .overlay(Rectangle().stroke(.white.opacity(0.3), lineWidth: 2))
                        Button(finder.busy ? "◈ LOCATING… ◈" : "📍 USE MY LOCATION") {
                            finder.locate { found in
                                if let found { city = found }
                            }
                        }
                        .buttonStyle(PixelButton(bg: SQ.teal, fg: SQ.panel))
                        .disabled(finder.busy)
                        if let err = finder.error {
                            Text(err).font(SQ.term(18)).foregroundStyle(SQ.coral)
                        }
                    }
                }

                if ready {
                    PixelPanel(fill: SQ.panelHi, border: .white.opacity(0.25)) {
                        Text(svc.waitingNearby > 0
                             ? "⚔ \(svc.waitingNearby) hero\(svc.waitingNearby == 1 ? "" : "es") waiting in \(city.trimmingCharacters(in: .whitespaces))!"
                             : "No heroes waiting in \(city.trimmingCharacters(in: .whitespaces)) yet — be the first.")
                            .font(SQ.term(20)).foregroundStyle(svc.waitingNearby > 0 ? SQ.green : .white.opacity(0.7))
                            .frame(maxWidth: .infinity)
                    }
                }

                Button("⚑ FIND A QUESTING PARTNER") {
                    let c = city.trimmingCharacters(in: .whitespacesAndNewlines)
                    game.setCity(c)
                    svc.findPartner(city: c, username: game.username, avatar: game.avatar)
                }
                .buttonStyle(PixelButton(bg: ready ? SQ.green : SQ.panel))
                .disabled(!ready)

                if let err = svc.error {
                    Text(err).font(SQ.term(19)).foregroundStyle(SQ.coral)
                }
                Spacer(minLength: 20)
            }
            .padding(16)
            .frame(maxWidth: 480)
            .frame(maxWidth: .infinity)
        }
        .onAppear {
            city = game.city
            if !city.isEmpty { svc.watchCity(city) }
        }
        .onChange(of: city) { c in svc.watchCity(c) }
    }
}

// MARK: - The party room (members, quest, chat)

private struct PartyRoom: View {
    let party: Party
    @EnvironmentObject var game: GameState
    @EnvironmentObject var feed: FeedService
    @EnvironmentObject var svc: PartyService

    @State private var draft = ""
    @State private var submitting = false
    @State private var success: Int?

    private var others: [PartyMember] { party.members.filter { $0.uid != svc.uid } }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                Text("YOUR PARTY").font(SQ.pixel(16)).foregroundStyle(SQ.gold).padding(.top, 10)

                PixelPanel(border: SQ.teal) {
                    VStack(spacing: 10) {
                        HStack(spacing: 18) {
                            ForEach(party.members) { m in
                                VStack(spacing: 4) {
                                    Text(m.avatar).font(.system(size: 34))
                                    Text(m.uid == svc.uid ? "you" : m.username)
                                        .font(SQ.term(16)).foregroundStyle(.white.opacity(0.85))
                                        .lineLimit(1)
                                }
                            }
                        }
                        Text("bound by fate in \(party.cityName)")
                            .font(SQ.term(18)).foregroundStyle(.white.opacity(0.55))
                    }
                    .frame(maxWidth: .infinity)
                }

                QuestCard(quest: party.quest)

                if party.status == "completed" {
                    PixelPanel(border: SQ.green) {
                        Text("QUEST COMPLETE!\nYour party found purpose together.")
                            .font(SQ.term(22)).foregroundStyle(.white)
                            .multilineTextAlignment(.center).frame(maxWidth: .infinity)
                    }
                    Button("⚑ NEW ADVENTURE") { svc.leaveParty() }
                        .buttonStyle(PixelButton(bg: SQ.teal, fg: SQ.panel))
                } else {
                    Button("✓ COMPLETE QUEST") { submitting = true }
                        .buttonStyle(PixelButton(bg: SQ.green))
                }

                chat

                if party.status != "completed" {
                    Button("✗ ABANDON PARTY") { svc.leaveParty() }
                        .buttonStyle(PixelButton(bg: SQ.coral))
                }
                Spacer(minLength: 20)
            }
            .padding(16)
            .frame(maxWidth: 480)
            .frame(maxWidth: .infinity)
        }
        .sheet(isPresented: $submitting) {
            SubmissionView(quest: party.quest) { story, image in
                let names = others.map(\.username).joined(separator: " & ")
                let tale = names.isEmpty ? story : "[Party quest with \(names)] \(story)"
                game.award(xp: party.quest.xp)
                feed.post(quest: party.quest, story: tale, image: image,
                          username: game.username, avatar: game.avatar)
                svc.markCompleted()
                success = party.quest.xp
            }
        }
        .sheet(item: Binding(get: { success.map { XPGain(xp: $0) } }, set: { success = $0?.xp })) { g in
            SuccessView(xp: g.xp)
        }
    }

    private struct XPGain: Identifiable { let xp: Int; var id: Int { xp } }

    private var chat: some View {
        PixelPanel {
            VStack(alignment: .leading, spacing: 10) {
                Text("PARTY CHAT").font(SQ.pixel(9)).foregroundStyle(.white.opacity(0.5))
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 8) {
                            if svc.messages.isEmpty {
                                Text("Say hi. Plan the absurdity.")
                                    .font(SQ.term(19)).foregroundStyle(.white.opacity(0.4))
                            }
                            ForEach(svc.messages) { m in
                                ChatBubble(msg: m, mine: m.byUid == svc.uid)
                                    .id(m.id)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .frame(height: 240)
                    .onChange(of: svc.messages) { msgs in
                        if let last = msgs.last { withAnimation { proxy.scrollTo(last.id, anchor: .bottom) } }
                    }
                    .onAppear {
                        if let last = svc.messages.last { proxy.scrollTo(last.id, anchor: .bottom) }
                    }
                }
                HStack(spacing: 8) {
                    TextField("", text: $draft,
                              prompt: Text("message…").foregroundColor(.white.opacity(0.35)))
                        .font(SQ.term(21)).foregroundStyle(.white)
                        .padding(8)
                        .background(.black.opacity(0.3))
                        .overlay(Rectangle().stroke(.white.opacity(0.3), lineWidth: 2))
                        .onSubmit { sendDraft() }
                    Button {
                        sendDraft()
                    } label: {
                        Image(systemName: "arrow.up").font(.system(size: 16, weight: .bold))
                            .foregroundStyle(SQ.panel)
                            .padding(10)
                            .background(SQ.gold)
                            .overlay(Rectangle().stroke(.black.opacity(0.35), lineWidth: 2))
                    }
                }
            }
        }
    }

    private func sendDraft() {
        svc.send(draft, username: game.username, avatar: game.avatar)
        draft = ""
    }
}

private struct ChatBubble: View {
    let msg: ChatMessage
    let mine: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 6) {
            if mine { Spacer(minLength: 40) }
            if !mine { Text(msg.avatar).font(.system(size: 20)) }
            VStack(alignment: .leading, spacing: 2) {
                if !mine {
                    Text(msg.username).font(SQ.pixel(8)).foregroundStyle(SQ.gold)
                }
                Text(msg.text).font(SQ.term(20)).foregroundStyle(mine ? SQ.panel : .white)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(8)
            .background(mine ? SQ.teal : SQ.panelHi)
            .overlay(Rectangle().stroke(.black.opacity(0.25), lineWidth: 2))
            if !mine { Spacer(minLength: 40) }
        }
        .frame(maxWidth: .infinity, alignment: mine ? .trailing : .leading)
    }
}
