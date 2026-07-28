import SwiftUI

struct ClubView: View {
    @EnvironmentObject private var identity: Identity
    @EnvironmentObject private var feed: FeedStore
    @EnvironmentObject private var events: EventsStore

    @FocusState private var editingHandle: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    PWCMasthead(title: "Club", subtitle: "Est. 2026")
                    membershipCard
                    handleField
                    stats
                    Text("“A society for the appreciation of strangers.”")
                        .font(.custom("CormorantGaramond-Italic", size: 18))
                        .foregroundStyle(PWC.sage).multilineTextAlignment(.center)
                        .padding(.top, 6)
                }
                .padding(16)
                .frame(maxWidth: 560)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(PWC.paper.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.hidden, for: .navigationBar)
        }
    }

    private var membershipCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("PEOPLE WATCHING CLUB").font(PWC.mono(10, .semibold)).tracking(2).foregroundStyle(.white.opacity(0.85))
                Spacer()
                Image(systemName: "binoculars").foregroundStyle(PWC.accent)
            }
            Spacer(minLength: 24)
            Text("MEMBER").font(PWC.mono(9)).tracking(2.5).foregroundStyle(.white.opacity(0.6))
            Text(identity.displayHandle)
                .font(PWC.display(30, .medium)).foregroundStyle(.white)
                .lineLimit(1).minimumScaleFactor(0.6)
            HStack {
                Text("SINCE \(memberSince)").font(PWC.mono(11)).tracking(1).foregroundStyle(.white.opacity(0.8))
                Spacer()
                Text("EST. 2026").font(PWC.mono(11)).tracking(1).foregroundStyle(.white.opacity(0.8))
            }
        }
        .padding(22)
        .frame(height: 210)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(hex: 0x141C33))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(PWC.accent, lineWidth: 1.5))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private var memberSince: String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "MMM yyyy"
        return f.string(from: identity.memberSince).uppercased()
    }

    private var handleField: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("HOW YOU SIGN YOUR NOTES")
                .font(PWC.mono(9)).tracking(1.5).foregroundStyle(PWC.sage)
            HStack(spacing: 10) {
                Image(systemName: "signature").foregroundStyle(PWC.sage).frame(width: 18)
                TextField("Anonymous", text: $identity.handle)
                    .font(PWC.mono(14)).foregroundStyle(PWC.ink)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($editingHandle)
                    .submitLabel(.done)
                    .onSubmit { editingHandle = false }
            }
            .padding(12)
            .background(PWC.card)
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(PWC.line))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var stats: some View {
        HStack(spacing: 0) {
            stat("\(feed.sightings.count)", "sightings")
            hairline
            stat("\(feed.totalNods)", "nods")
            hairline
            stat("\(events.usingSamples ? 0 : events.events.count)", "meetups")
        }
        .padding(.vertical, 18)
        .frame(maxWidth: .infinity)
        .background(PWC.cardBg)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(PWC.cardLine, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var hairline: some View {
        Rectangle().fill(PWC.cardLine).frame(width: 1, height: 34)
    }

    private func stat(_ n: String, _ label: String) -> some View {
        VStack(spacing: 5) {
            Text(n).font(PWC.display(26, .medium)).foregroundStyle(PWC.accent)
            Text(label.uppercased()).font(PWC.mono(9)).tracking(1.5).foregroundStyle(PWC.cardSub)
        }
        .frame(maxWidth: .infinity)
    }
}
