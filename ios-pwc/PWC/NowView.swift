import SwiftUI

struct NowView: View {
    @EnvironmentObject private var moderation: Moderation
    @State private var sightings = Mock.sightings
    @State private var composing = false
    @State private var reporting: Sighting?
    @State private var reported = false

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 14) {
                    masthead
                    postButton
                    if let next = Mock.events.first { eventPeek(next) }
                    HStack {
                        Text("THE FEED").font(PWC.mono(12, .semibold)).tracking(2).foregroundStyle(PWC.dim)
                        Spacer()
                    }
                    .padding(.top, 4)
                    ForEach($sightings) { $s in
                        if !moderation.isBlocked(s.handle) {
                            SightingCard(
                                sighting: $s,
                                onReport: { reporting = s },
                                onBlock: { withAnimation { moderation.block(s.handle) } }
                            )
                        }
                    }
                }
                .padding(16)
                .frame(maxWidth: 560)
                .frame(maxWidth: .infinity)
            }
            .background(PWC.paper.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.hidden, for: .navigationBar)
            .sheet(isPresented: $composing) {
                PostSightingView { note, place, hood in
                    sightings.insert(.init(handle: "@you", note: note, place: place,
                                           neighborhood: hood, minutesAgo: 0, nods: 0, watchingHere: 1), at: 0)
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
                .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    private func eventPeek(_ e: PWCEvent) -> some View {
        HStack(spacing: 12) {
            VStack(spacing: 0) {
                Text(e.day.uppercased()).font(PWC.mono(11, .bold)).foregroundStyle(PWC.accent)
                Text(e.date.split(separator: "·").first.map(String.init)?.replacingOccurrences(of: "Jun ", with: "") ?? "")
                    .font(PWC.display(20, .bold)).foregroundStyle(PWC.cardInk)
            }
            .frame(width: 46)
            VStack(alignment: .leading, spacing: 2) {
                Text("NEXT MEETUP").font(PWC.mono(10, .semibold)).tracking(1.5).foregroundStyle(PWC.accent)
                Text(e.title).font(PWC.display(16, .semibold)).foregroundStyle(PWC.cardInk)
                Text("\(e.place) · \(e.going) going").font(PWC.mono(12)).foregroundStyle(PWC.cardSub)
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
    @Binding var sighting: Sighting
    var onReport: () -> Void
    var onBlock: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Text(sighting.handle).font(PWC.mono(11, .semibold)).tracking(0.5).foregroundStyle(PWC.cardInk)
                Spacer()
                Text(sighting.ago).font(PWC.mono(11)).foregroundStyle(PWC.cardSub)
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
                Label("\(sighting.place) · \(sighting.neighborhood)", systemImage: "mappin")
                    .font(PWC.mono(10)).tracking(0.5).foregroundStyle(PWC.cardSub).lineLimit(1)
                Spacer()
                if sighting.watchingHere > 1 {
                    Text("\(sighting.watchingHere) here").font(PWC.mono(10)).foregroundStyle(PWC.cardSub)
                }
                Button { sighting.nods += 1 } label: {
                    HStack(spacing: 3) {
                        Image(systemName: "hand.thumbsup.fill").font(.system(size: 11))
                        Text("\(sighting.nods)").font(PWC.mono(11, .semibold))
                    }
                    .foregroundStyle(PWC.cardSub)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PWC.cardBg)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(PWC.cardLine, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
