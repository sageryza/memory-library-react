import SwiftUI

struct ClubView: View {
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    membershipCard
                    stats
                    Text("“A society for the appreciation of strangers.”")
                        .font(.custom("CormorantGaramond-Italic", size: 17))
                        .foregroundStyle(PWC.sage).multilineTextAlignment(.center)
                        .padding(.top, 4)
                }
                .padding(16)
                .frame(maxWidth: 560)
                .frame(maxWidth: .infinity)
            }
            .background(PWC.paper.ignoresSafeArea())
            .navigationTitle("Club")
        }
    }

    private var membershipCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("PEOPLE WATCHING CLUB").font(PWC.mono(11, .bold)).tracking(1).foregroundStyle(.white.opacity(0.9))
                Spacer()
                Image(systemName: "eye.fill").foregroundStyle(.white.opacity(0.9))
            }
            Spacer(minLength: 24)
            Text("MEMBER").font(PWC.mono(10)).tracking(2).foregroundStyle(.white.opacity(0.7))
            Text("@you").font(PWC.display(26, .bold)).foregroundStyle(.white)
            HStack {
                Text("NO. 0001").font(PWC.mono(12)).foregroundStyle(.white.opacity(0.85))
                Spacer()
                Text("EST. 2026").font(PWC.mono(12)).foregroundStyle(.white.opacity(0.85))
            }
        }
        .padding(20)
        .frame(height: 210)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(colors: [Color(hex: 0x1B2747), Color(hex: 0x0C1120)], startPoint: .topLeading, endPoint: .bottomTrailing)
        )
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(PWC.accent, lineWidth: 2))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private var stats: some View {
        HStack {
            stat("4", "sightings")
            Divider().frame(height: 36)
            stat("76", "nods")
            Divider().frame(height: 36)
            stat("2", "meetups")
        }
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity)
        .background(PWC.card)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(PWC.line, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func stat(_ n: String, _ label: String) -> some View {
        VStack(spacing: 3) {
            Text(n).font(PWC.display(22, .bold)).foregroundStyle(PWC.ink)
            Text(label).font(PWC.mono(10)).foregroundStyle(PWC.sage)
        }
        .frame(maxWidth: .infinity)
    }
}
