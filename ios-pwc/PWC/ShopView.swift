import SwiftUI

struct ShopView: View {
    @EnvironmentObject private var shop: ShopStore
    @Environment(\.openURL) private var openURL

    private let cols = [GridItem(.flexible(), spacing: 14), GridItem(.flexible(), spacing: 14)]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    PWCMasthead(title: "Shop", subtitle: "Wear the eye")
                    giftBanner
                    if shop.isLoading && shop.products.isEmpty {
                        ProgressView().tint(PWC.accent).padding(.top, 30)
                    } else if shop.failed && shop.products.isEmpty {
                        unavailable
                    } else {
                        LazyVGrid(columns: cols, spacing: 14) {
                            ForEach(shop.products) { item in
                                Button {
                                    if let url = item.storeURL { openURL(url) }
                                } label: {
                                    ShopCard(item: item)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
                .padding(16)
                .frame(maxWidth: 620)
                .frame(maxWidth: .infinity)
            }
            .refreshable { await shop.refresh() }
            .background(PWC.paper.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.hidden, for: .navigationBar)
            .task { await shop.refresh() }
        }
    }

    private var unavailable: some View {
        VStack(spacing: 8) {
            Text("The shop is closed just now.")
                .font(PWC.display(18, .medium)).foregroundStyle(PWC.ink)
            Text("Pull down to try again.")
                .font(PWC.mono(11)).foregroundStyle(PWC.dim)
        }
        .padding(.top, 30)
    }

    private var giftBanner: some View {
        HStack(spacing: 14) {
            Image(systemName: "person.text.rectangle")
                .font(.system(size: 24, weight: .light)).foregroundStyle(PWC.accent)
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
    let item: ShopProduct

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ZStack {
                RoundedRectangle(cornerRadius: 10).fill(Color(hex: 0xFCF8EE))
                if let url = item.imageURL {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image.resizable().aspectRatio(contentMode: .fill)
                        case .failure:
                            Image(systemName: "binoculars")
                                .font(.system(size: 30, weight: .thin))
                                .foregroundStyle(PWC.cardSub)
                        default:
                            ProgressView().tint(PWC.cardSub)
                        }
                    }
                } else {
                    Image(systemName: "binoculars")
                        .font(.system(size: 30, weight: .thin))
                        .foregroundStyle(PWC.cardSub)
                }
            }
            .frame(height: 120)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(PWC.cardLine, lineWidth: 1))

            Text(item.title).font(PWC.display(17, .medium)).foregroundStyle(PWC.cardInk)
                .lineLimit(2).fixedSize(horizontal: false, vertical: true)
            if !item.blurb.isEmpty {
                Text(item.blurb).font(PWC.mono(10)).foregroundStyle(PWC.cardSub).lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack {
                Text(item.price).font(PWC.display(17, .semibold)).foregroundStyle(PWC.accent)
                Spacer()
                Image(systemName: "arrow.up.right").foregroundStyle(PWC.accent).font(.footnote)
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
