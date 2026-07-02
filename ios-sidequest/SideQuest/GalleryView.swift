import SwiftUI

struct GalleryView: View {
    @EnvironmentObject var game: GameState
    @EnvironmentObject var feed: FeedService

    /// The founding legends — bundled posts that seed the Hall so it's never
    /// an empty room. Always shown after the live feed.
    private static let seeded: [FeedPost] = [
        .init(id: "seed-0", questTitle: "The Watermelon Child",
              story: "Steve (the watermelon) met three strangers. One proposed. We said no.",
              username: "Sir Rindsworth", avatar: "🧙‍♂️", byUid: "", ts: 0,
              reactions: ["laugh": 42], imageData: nil, isSeed: true),
        .init(id: "seed-1", questTitle: "Reverse Shopping",
              story: "Returned 6 items I never bought. The cashier slow-clapped. Legendary.",
              username: "voidwalker99", avatar: "🦹", byUid: "", ts: 0,
              reactions: ["clap": 88], imageData: nil, isSeed: true),
        .init(id: "seed-2", questTitle: "Invisible Pet Walk",
              story: "Mr. Whiskers (invisible) got loose near the fountain. Chaos. No regrets.",
              username: "npc_no_4127", avatar: "🧝", byUid: "", ts: 0,
              reactions: ["mind": 17], imageData: nil, isSeed: true),
    ]

    /// Live shared posts first; if the feed is unreachable, fall back to this
    /// device's own submissions so the Hall still works offline. Posts from
    /// blocked heroes and reported posts are filtered out.
    private var posts: [FeedPost] {
        let live = (feed.posts.isEmpty ? game.mySubmissions.map(Self.localPost) : feed.posts)
            .filter { !game.blockedUids.contains($0.byUid) && !game.hiddenPostIds.contains($0.id) }
        return live + Self.seeded
    }

    private static func localPost(_ s: Submission) -> FeedPost {
        FeedPost(id: s.id.uuidString, questTitle: s.questTitle, story: s.story,
                 username: s.username, avatar: s.avatar, byUid: "", ts: s.ts,
                 reactions: [:], imageData: s.imageData, isSeed: true)
    }

    var body: some View {
        ZStack {
            SQ.background.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 16) {
                    Text("HALL OF ABSURDITY").font(SQ.pixel(16)).foregroundStyle(SQ.gold)
                        .padding(.top, 10).multilineTextAlignment(.center)
                    Text("Every hero's completed quests, worldwide.")
                        .font(SQ.term(19)).foregroundStyle(.white.opacity(0.6))
                    ForEach(posts) { post in GalleryCard(post: post) }
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
    let post: FeedPost
    @EnvironmentObject var game: GameState
    @EnvironmentObject var feed: FeedService
    @State private var moderating = false

    private var mine: Bool { !post.byUid.isEmpty && post.byUid == feed.uid }
    private var myReaction: String? { game.reacted[post.id] }

    var body: some View {
        PixelPanel(border: mine ? SQ.teal : SQ.gold) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Text(post.avatar).font(.system(size: 26))
                    VStack(alignment: .leading, spacing: 1) {
                        Text(post.username).font(SQ.pixel(10)).foregroundStyle(SQ.gold)
                        Text(post.questTitle).font(SQ.term(17)).foregroundStyle(SQ.teal)
                    }
                    Spacer()
                    if mine {
                        Text("YOU").font(SQ.pixel(8)).foregroundStyle(SQ.panel)
                            .padding(.vertical, 4).padding(.horizontal, 6).background(SQ.teal)
                    } else if !post.isSeed {
                        Button { moderating = true } label: {
                            Image(systemName: "flag")
                                .font(.system(size: 14)).foregroundStyle(.white.opacity(0.35))
                        }
                    }
                }
                if let d = post.imageData, let ui = UIImage(data: d) {
                    Image(uiImage: ui).resizable().scaledToFill()
                        .frame(height: 180).frame(maxWidth: .infinity).clipped()
                        .overlay(Rectangle().stroke(.white.opacity(0.2), lineWidth: 2))
                }
                Text(post.story).font(SQ.term(21)).foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 14) {
                    ForEach(FeedService.reactionKeys, id: \.self) { key in
                        Button { toggle(key) } label: {
                            HStack(spacing: 3) {
                                Text(FeedService.reactionEmoji[key] ?? "✦").font(.system(size: 22))
                                if let n = post.reactions[key], n > 0 {
                                    Text("\(n)").font(SQ.term(18)).foregroundStyle(.white.opacity(0.8))
                                }
                            }
                            .opacity(myReaction == nil || myReaction == key ? 1 : 0.4)
                        }
                        .disabled(post.isSeed)
                    }
                    Spacer()
                    Text("\(post.reactionTotal) ✦").font(SQ.term(19)).foregroundStyle(SQ.gold)
                }
            }
        }
        .confirmationDialog("This post", isPresented: $moderating, titleVisibility: .visible) {
            Button("Report post", role: .destructive) {
                Reports.file(type: "post", refId: post.id, offenderUid: post.byUid, text: post.story)
                game.hide(postId: post.id)
            }
            Button("Block \(post.username)", role: .destructive) {
                game.block(post.byUid)
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Reporting hides the post and flags it for review. Blocking hides everything from this hero.")
        }
    }

    private func toggle(_ key: String) {
        let old = myReaction
        let new: String? = (old == key) ? nil : key
        withAnimation {
            game.setReaction(postId: post.id, to: new)
            feed.react(post: post, from: old, to: new)
        }
    }
}
