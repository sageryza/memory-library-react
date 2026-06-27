import SwiftUI

/// A plain placeholder mannequin built from basic shapes. Owner will restyle /
/// replace with real figure art; this just resembles the model (skin + hair).
struct FigureView: View {
    let figure: Figure
    var scale: CGFloat = 1

    private var skin: Color { ClosetStore.skinTones[min(figure.skin, ClosetStore.skinTones.count - 1)] }
    private var hairColor: Color { ClosetStore.hairColors[min(figure.hairColor, ClosetStore.hairColors.count - 1)] }
    private var style: String { ClosetStore.hairStyles[min(figure.hair, ClosetStore.hairStyles.count - 1)] }

    var body: some View {
        VStack(spacing: 2 * scale) {
            ZStack {
                if style == "Long" {
                    Capsule().fill(hairColor).frame(width: 56 * scale, height: 70 * scale).offset(y: 16 * scale)
                }
                Circle().fill(skin).frame(width: 46 * scale, height: 46 * scale)
                switch style {
                case "Short": Capsule().fill(hairColor).frame(width: 50 * scale, height: 26 * scale).offset(y: -16 * scale)
                case "Long": Capsule().fill(hairColor).frame(width: 50 * scale, height: 28 * scale).offset(y: -15 * scale)
                case "Bun": Circle().fill(hairColor).frame(width: 22 * scale, height: 22 * scale).offset(y: -30 * scale)
                default: EmptyView()
                }
            }
            Capsule().fill(skin).frame(width: 56 * scale, height: 74 * scale)
            HStack(spacing: 8 * scale) {
                Capsule().fill(skin).frame(width: 18 * scale, height: 64 * scale)
                Capsule().fill(skin).frame(width: 18 * scale, height: 64 * scale)
            }
        }
    }
}
