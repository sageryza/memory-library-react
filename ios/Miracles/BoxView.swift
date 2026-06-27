import SwiftUI

/// One miracle: a square drawing frame with the draw / undo / redo controls in
/// its bottom-right corner, and a handwritten caption on ruled lines beneath.
struct BoxView: View {
    @ObservedObject var store: MiraclesStore
    let box: MiracleBox
    @Binding var distill: Bool

    @State private var drawing = false
    @State private var errorText: String?

    private let lineHeight: CGFloat = 28

    var body: some View {
        VStack(spacing: 6) {
            ZStack {
                Rectangle()
                    .fill(Color.white)
                    .overlay(Rectangle().stroke(Theme.line, lineWidth: 1))

                if let urlString = box.url, let url = URL(string: urlString) {
                    AsyncImage(url: url) { image in
                        image.resizable().scaledToFit()
                    } placeholder: {
                        ProgressView().tint(Theme.gold)
                    }
                    .padding(2)
                }

                if drawing { ProgressView().tint(Theme.gold) }

                VStack {
                    Spacer()
                    HStack {
                        Spacer()
                        controls
                    }
                }
                .padding(5)
            }
            .aspectRatio(1, contentMode: .fit)
            .clipped()

            caption

            if let errorText {
                Text(errorText)
                    .font(.caption2).foregroundStyle(.red)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private var caption: some View {
        ZStack(alignment: .topLeading) {
            RuledLines(spacing: lineHeight)
            TextField(
                "",
                text: Binding(get: { box.text }, set: { store.setText($0, boxID: box.id) }),
                axis: .vertical
            )
            .lineLimit(3, reservesSpace: true)
            .lineSpacing(9)
            .font(.custom(Theme.handwriting, size: 20))
            .foregroundStyle(Theme.captionInk)
            .tint(Theme.gold)
            .padding(.horizontal, 2)
            .offset(y: 1)
        }
        .frame(height: lineHeight * 3)
    }

    private var controls: some View {
        HStack(spacing: 4) {
            if box.canUndo {
                arrow("chevron.left") { store.step(-1, boxID: box.id) }
            }

            Button(action: draw) {
                HStack(spacing: 4) {
                    Text(box.url == nil ? "draw" : "redraw")
                    Image(systemName: "sparkles")
                }
                .font(.custom(Theme.serif, size: 15))
                .foregroundStyle(Theme.serifInk)
                .padding(.horizontal, 9)
                .padding(.vertical, 3)
                .background(.white.opacity(0.85))
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(Theme.line))
                .clipShape(RoundedRectangle(cornerRadius: 6))
            }
            .buttonStyle(.plain)
            .disabled(box.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || drawing)
            .opacity(box.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.45 : 1)

            if box.canRedo {
                arrow("chevron.right") { store.step(1, boxID: box.id) }
            }
        }
    }

    private func arrow(_ symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.gold)
                .frame(width: 22, height: 22)
                .background(.white.opacity(0.85))
                .clipShape(Circle())
                .overlay(Circle().stroke(Theme.gold.opacity(0.6)))
        }
        .buttonStyle(.plain)
    }

    private func draw() {
        let text = box.text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !drawing else { return }
        drawing = true
        errorText = nil
        Task {
            do {
                let result = try await MiraclesService.shared.illustrate(
                    text: text, boxID: box.id, distill: distill
                )
                store.pushDrawing(result.url, boxID: box.id)
            } catch {
                errorText = error.localizedDescription
            }
            drawing = false
        }
    }
}

/// Soft tan horizontal writing lines, repeating every `spacing` points —
/// matches the web preview's lined-paper caption.
struct RuledLines: View {
    var spacing: CGFloat = 28

    var body: some View {
        GeometryReader { geo in
            Path { p in
                var y = spacing
                while y <= geo.size.height + 0.5 {
                    p.move(to: CGPoint(x: 0, y: y))
                    p.addLine(to: CGPoint(x: geo.size.width, y: y))
                    y += spacing
                }
            }
            .stroke(Theme.ruled, lineWidth: 1)
        }
    }
}
