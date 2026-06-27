import SwiftUI

struct GalleryView: View {
    @EnvironmentObject var game: GameState

    private let seeded: [Submission] = [
        .init(questTitle: "The Watermelon Child", story: "Steve (the watermelon) met three strangers. One proposed. We said no.",
              username: "Sir Rindsworth", avatar: "🧙‍♂️", ts: 0, reactions: 42),
        .init(questTitle: "Reverse Shopping", story: "Returned 6 items I never bought. The cashier slow-clapped. Legendary.",
              username: "voidwalker99", avatar: "🦹", ts: 0, reactions: 88),
        .init(questTitle: "Invisible Pet Walk", story: "Mr. Whiskers (invisible) got loose near the fountain. Chaos. No regrets.",
              username: "npc_no_4127", avatar: "🧝", ts: 0, reactions: 17),
    ]
    private var feed: [Submission] { game.mySubmissions + seeded }

    var body: some View {
        ZStack {
            SQ.background.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 16) {
                    Text("HALL OF ABSURDITY").font(SQ.pixel(16)).foregroundStyle(SQ.gold)
                        .padding(.top, 10).multilineTextAlignment(.center)
                    ForEach(feed) { sub in GalleryCard(sub: sub) }
                    Spacer(minLength: 20)
                }
                .padding(16)
                .frame(maxWidth: 480)
                .frame(maxWidth: .infinity)
            }
        }
    }
}

struct GalleryCard: View {
    let sub: Submission
    @State private var reacted: String?
    @State private var bonus = 0

    var body: some View {
        PixelPanel {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Text(sub.avatar).font(.system(size: 26))
                    VStack(alignment: .leading, spacing: 1) {
                        Text(sub.username).font(SQ.pixel(10)).foregroundStyle(SQ.gold)
                        Text(sub.questTitle).font(SQ.term(17)).foregroundStyle(SQ.teal)
                    }
                    Spacer()
                }
                if let d = sub.imageData, let ui = UIImage(data: d) {
                    Image(uiImage: ui).resizable().scaledToFill()
                        .frame(height: 180).frame(maxWidth: .infinity).clipped()
                        .overlay(Rectangle().stroke(.white.opacity(0.2), lineWidth: 2))
                }
                Text(sub.story).font(SQ.term(21)).foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 14) {
                    ForEach(["😂", "🤯", "👏"], id: \.self) { e in
                        Button { withAnimation { reacted = (reacted == e ? nil : e); bonus = reacted == nil ? 0 : 1 } } label: {
                            Text(e).font(.system(size: 22)).opacity(reacted == nil || reacted == e ? 1 : 0.4)
                        }
                    }
                    Spacer()
                    Text("\(sub.reactions + bonus) ✦").font(SQ.term(19)).foregroundStyle(SQ.gold)
                }
            }
        }
    }
}
