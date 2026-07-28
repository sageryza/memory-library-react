import SwiftUI

struct NowView: View {
    @EnvironmentObject private var moderation: Moderation
    @EnvironmentObject private var identity: Identity
    @EnvironmentObject private var feed: FeedStore
    @EnvironmentObject private var events: EventsStore

    @State private var composing = false
    @State private var reporting: Sighting?
    @State private var reported = false

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 14) {
                    masthead
                    if let next = events.next { eventPeek(next) }
                    HStack {
                        Text("FIELD NOTES").font(PWC.mono(12, .semibold)).tracking(2).foregroundStyle(PWC.sage)
                        Spacer()
                        if feed.offline {
                            Label("offline", systemImage: "wifi.slash")
                                .font(PWC.mono(10)).foregroundStyle(PWC.dim)
                        }
                    }
                    .padding(.top, 4)
                    postButton
                    ForEach(feed.sightings) { s in
                        if !moderation.isBlocked(s.handle) {
                            SightingCard(
                                sighting: s,
                                onNod: { feed.nod(s.id) },
                                onReport: { reporting = s },
                                onBlock: { withAnimation { moderation.block(s.handle) } }
                            )
                        }
                    }
                    if feed.sightings.isEmpty && feed.isLoading {
                        ProgressView().tint(PWC.accent).padding(.top, 24)
                    }
                }
                .padding(16)
                .frame(maxWidth: 560)
                .frame(maxWidth: .infinity)
            }
            .refreshable { await feed.refresh() }
            .background(PWC.paper.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.hidden, for: .navigationBar)
            .task {
                await feed.refresh()
                await events.refresh()
            }
            .sheet(isPresented: $composing) {
                PostSightingView { note, place, hood in
                    feed.post(note: note, place: place, neighborhood: hood,
                              as: identity.authorName)
                }
            }
            .sheet(item: $reporting) { _ in
                ReportSheet(
                    subjectLabel: "this post",
                    onSubmit: { _, _ in reporting = nil; reported = true },
                    onCancel: { reporting = nil }
                )
            }
            .alert("Thanks — we'll review this.", isPresented: $reported) {
                Button("OK", role: .cancel) {}
            }
        }
    }

    private var masthead: some View {
        VStack(spacing: 14) {
            Image(systemName: "binoculars")
                .font(.system(size: 32, weight: .thin))
                .foregroundStyle(PWC.accent)
            Text("PEOPLE WATCHING CLUB")
                .font(PWC.display(25)).tracking(6).lineSpacing(3)
                .foregroundStyle(PWC.accent).multilineTextAlignment(.center)
            Rectangle().fill(PWC.accent).frame(width: 46, height: 1)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 20).padding(.bottom, 14)
    }

    private var postButton: some View {
        Button { composing = true } label: {
            Text("Post a sighting")
                .font(PWC.display(17, .semibold))
                .foregroundStyle(PWC.onAccent)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14).padding(.horizontal, 18)
                .background(PWC.accent)
                .clipShape(RoundedRectangle(cornerRadius: 6))
        }
    }

    private func eventPeek(_ e: PWCEvent) -> some View {
        HStack(spacing: 12) {
            VStack(spacing: 0) {
                Text(e.weekday.uppercased()).font(PWC.mono(11, .bold)).foregroundStyle(PWC.accent)
                Text(e.dayNumber).font(PWC.display(20, .bold)).foregroundStyle(PWC.cardInk)
            }
            .frame(width: 46)
            VStack(alignment: .leading, spacing: 2) {
                Text("NEXT MEETUP").font(PWC.mono(10, .semibold)).tracking(1.5).foregroundStyle(PWC.accent)
                Text(e.title).font(PWC.display(16, .semibold)).foregroundStyle(PWC.cardInk)
                Text([e.place, e.timeText].filter { !$0.isEmpty }.joined(separator: " · "))
                    .font(PWC.mono(12)).foregroundStyle(PWC.cardSub).lineLimit(1)
            }
            Spacer()
            Image(systemName: "chevron.right").foregroundStyle(PWC.cardSub).font(.footnote)
        }
        .padding(12)
        .background(PWC.cardBg)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(PWC.cardLine, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

struct SightingCard: View {
    let sighting: Sighting
    var onNod: () -> Void
    var onReport: () -> Void
    var onBlock: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Text(sighting.pending ? "sending…" : sighting.ago)
                    .font(PWC.mono(11)).foregroundStyle(PWC.cardSub)
                Spacer()
                Menu {
                    Button { onReport() } label: { Label("Report post", systemImage: "flag") }
                    Button(role: .destructive) { onBlock() } label: {
                        Label("Block \(sighting.handle)", systemImage: "hand.raised")
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .font(PWC.mono(13)).foregroundStyle(PWC.cardSub)
                        .frame(width: 30, height: 22, alignment: .trailing)
                        .contentShape(Rectangle())
                }
            }
            Text(sighting.note).font(PWC.display(18, .regular)).foregroundStyle(PWC.cardInk)
                .lineSpacing(2).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 10) {
                if !sighting.place.isEmpty {
                    Label(sighting.place, systemImage: "mappin")
                        .font(PWC.mono(10)).tracking(0.5).foregroundStyle(PWC.cardSub).lineLimit(1)
                }
                Text("— \(sighting.handle)")
                    .font(PWC.mono(10)).foregroundStyle(PWC.cardSub).lineLimit(1)
                Spacer()
                Button { onNod() } label: {
                    HStack(spacing: 3) {
                        Image(systemName: "hand.thumbsup.fill").font(.system(size: 11))
                        Text("\(sighting.nods)").font(PWC.mono(11, .semibold))
                    }
                    .foregroundStyle(PWC.cardSub)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PWC.cardBg)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(PWC.cardLine, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .opacity(sighting.pending ? 0.72 : 1)
    }
}
