import SwiftUI

struct ClubView: View {
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    PWCMasthead(title: "Club", subtitle: "Est. 2026")
                    membershipCard
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
            Text("@you").font(PWC.display(30, .medium)).foregroundStyle(.white)
            HStack {
                Text("NO. 0001").font(PWC.mono(11)).tracking(1).foregroundStyle(.white.opacity(0.8))
                Spacer()
                Text("EST. 2026").font(PWC.mono(11)).tracking(1).foregroundStyle(.white.opacity(0.8))
            }
        }
        .padding(22)
        .frame(height: 210)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(colors: [Color(hex: 0x1B2747), Color(hex: 0x0C1120)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
        )
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(PWC.accent, lineWidth: 1.5))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private var stats: some View {
        HStack(spacing: 0) {
            stat("4", "sightings")
            hairline
            stat("76", "nods")
            hairline
            stat("2", "meetups")
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
