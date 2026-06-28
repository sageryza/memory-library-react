import SwiftUI

/// Curate — the deck editor (deck on/off toggles + per-card ♥/✕). Full grid
/// editor is being built next; this keeps the nav destination in place.
struct CurateView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text("XI")
                    .font(.system(.title2, design: .serif).weight(.semibold)).tracking(6)
                    .foregroundStyle(XITheme.ink).padding(.bottom, 18)

                VStack(spacing: 12) {
                    Image(systemName: "heart.text.square")
                        .font(.system(size: 38)).foregroundStyle(XITheme.maroon.opacity(0.8))
                    Text("Curate")
                        .font(.system(.title3, design: .serif)).foregroundStyle(XITheme.ink)
                    Text("Choose which cards are in play — toggle whole decks on or off and ♥ or remove individual cards. Coming in the next update.")
                        .font(.system(.callout, design: .serif)).foregroundStyle(XITheme.line)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 60).padding(.horizontal, 20)
            }
            .padding(.horizontal, 16).padding(.top, 18)
            .frame(maxWidth: 560).frame(maxWidth: .infinity)
        }
        .background(XITheme.paper.ignoresSafeArea())
    }
}
