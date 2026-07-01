import SwiftUI

struct ShopView: View {
    private let cols = [GridItem(.flexible(), spacing: 14), GridItem(.flexible(), spacing: 14)]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    PWCMasthead(title: "Shop", subtitle: "Wear the eye")
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
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.hidden, for: .navigationBar)
        }
    }

    private var giftBanner: some View {
        HStack(spacing: 14) {
            Text("🪪").font(.system(size: 28))
            VStack(alignment: .leading, spacing: 3) {
                Text("Every order ships with a Membership Card")
                    .font(PWC.display(16, .medium)).foregroundStyle(PWC.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text("OFFICIALLY ONE OF US")
                    .font(PWC.mono(9)).tracking(1.5).foregroundStyle(PWC.accent)
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(PWC.accent.opacity(0.5), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

struct ShopCard: View {
    let item: ShopItem

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ZStack {
                RoundedRectangle(cornerRadius: 10).fill(Color(hex: 0xFCF8EE))
                Text(item.emoji).font(.system(size: 46))
            }
            .frame(height: 120)
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(PWC.cardLine, lineWidth: 1))
            .overlay(alignment: .topTrailing) {
                if item.freeGift {
                    Text("+ CARD").font(PWC.mono(8, .bold)).tracking(0.5)
                        .padding(.horizontal, 6).padding(.vertical, 3)
                        .background(PWC.accent).foregroundStyle(PWC.onAccent)
                        .clipShape(RoundedRectangle(cornerRadius: 4)).padding(6)
                }
            }
            Text(item.name).font(PWC.display(17, .medium)).foregroundStyle(PWC.cardInk)
            Text(item.blurb).font(PWC.mono(10)).foregroundStyle(PWC.cardSub).lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
            HStack {
                Text(item.price).font(PWC.display(17, .semibold)).foregroundStyle(PWC.accent)
                Spacer()
                Image(systemName: "bag.badge.plus").foregroundStyle(PWC.accent)
            }
            .padding(.top, 2)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PWC.cardBg)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(PWC.cardLine, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
