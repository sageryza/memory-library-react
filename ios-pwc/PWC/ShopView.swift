import SwiftUI

struct ShopView: View {
    private let cols = [GridItem(.flexible(), spacing: 14), GridItem(.flexible(), spacing: 14)]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    giftBanner
                    LazyVGrid(columns: cols, spacing: 14) {
                        ForEach(Mock.shop) { item in ShopCard(item: item) }
                    }
                }
                .padding(16)
                .frame(maxWidth: 620)
                .frame(maxWidth: .infinity)
            }
            .background(PWC.paper.ignoresSafeArea())
            .navigationTitle("Shop")
        }
    }

    private var giftBanner: some View {
        HStack(spacing: 12) {
            Text("🪪").font(.system(size: 30))
            VStack(alignment: .leading, spacing: 2) {
                Text("Every order ships with a Membership Card")
                    .font(PWC.display(15, .semibold)).foregroundStyle(PWC.ink)
                Text("Officially one of us. Or grab the card on its own.")
                    .font(PWC.mono(11)).foregroundStyle(PWC.sage)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PWC.accent.opacity(0.10))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(PWC.accent.opacity(0.35), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

struct ShopCard: View {
    let item: ShopItem

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ZStack {
                RoundedRectangle(cornerRadius: 10).fill(PWC.paper)
                Text(item.emoji).font(.system(size: 46))
            }
            .frame(height: 120)
            .overlay(alignment: .topTrailing) {
                if item.freeGift {
                    Text("+ card").font(PWC.mono(9, .bold))
                        .padding(.horizontal, 6).padding(.vertical, 3)
                        .background(PWC.accent).foregroundStyle(PWC.onAccent)
                        .clipShape(Capsule()).padding(6)
                }
            }
            Text(item.name).font(PWC.display(16, .semibold)).foregroundStyle(PWC.ink)
            Text(item.blurb).font(PWC.mono(10)).foregroundStyle(PWC.sage).lineLimit(2)
            HStack {
                Text(item.price).font(PWC.display(16, .bold)).foregroundStyle(PWC.ink)
                Spacer()
                Image(systemName: "bag.badge.plus").foregroundStyle(PWC.accent)
            }
        }
        .padding(12)
        .background(PWC.card)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(PWC.line, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
