import SwiftUI

/// The paper-doll base figure — sticker-book style art (white cami or ribbed
/// tank + lace-hem bloomers) that outfits get placed onto. Two bases for now:
/// girl and boy, committed in Assets.xcassets.
struct FigureView: View {
    let figure: Figure
    var scale: CGFloat = 1

    var body: some View {
        Image(figure.isBoy ? "doll-boy" : "doll-girl")
            .resizable()
            .scaledToFit()
            .frame(height: 220 * scale)
    }
}
