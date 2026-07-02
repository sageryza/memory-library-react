import SwiftUI
import UIKit
import ImageIO

/// Opening title sequence — plays the bundled pixel-art GIF once (the crowd
/// waits, the sword plummets from the sky, the SIDE QUEST card lands), holds
/// the final frame, then fades into the main tabs. Tap anywhere to skip.
struct IntroView: View {
    var onDone: () -> Void
    @State private var finished = false

    // sky blue pulled from the GIF's title card, so edges blend seamlessly
    private let sky = Color(hex: 0x55A7DC)

    var body: some View {
        ZStack {
            sky.ignoresSafeArea()
            GIFPlayer(name: "Intro") { finish() }
                .ignoresSafeArea()
        }
        .contentShape(Rectangle())
        .onTapGesture { finish() }
    }

    private func finish() {
        guard !finished else { return }
        finished = true
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        onDone()
    }
}

/// Plays a bundled GIF exactly once in a UIImageView (frames + timing decoded
/// via ImageIO), holds the last frame, and reports completion. Nearest-neighbor
/// scaling keeps the pixel art crisp on big screens.
private struct GIFPlayer: UIViewRepresentable {
    let name: String
    var onFinished: () -> Void

    func makeUIView(context: Context) -> UIImageView {
        let view = UIImageView()
        view.contentMode = .scaleAspectFill
        view.clipsToBounds = true
        view.layer.magnificationFilter = .nearest

        guard let url = Bundle.main.url(forResource: name, withExtension: "gif"),
              let source = CGImageSourceCreateWithURL(url as CFURL, nil) else {
            DispatchQueue.main.async { onFinished() }
            return view
        }

        var frames: [UIImage] = []
        var total: Double = 0
        for i in 0..<CGImageSourceGetCount(source) {
            guard let cg = CGImageSourceCreateImageAtIndex(source, i, nil) else { continue }
            let props = CGImageSourceCopyPropertiesAtIndex(source, i, nil) as? [CFString: Any]
            let gif = props?[kCGImagePropertyGIFDictionary] as? [CFString: Any]
            let unclamped = gif?[kCGImagePropertyGIFUnclampedDelayTime] as? Double ?? 0
            let delay = unclamped > 0 ? unclamped : (gif?[kCGImagePropertyGIFDelayTime] as? Double ?? 0.1)
            total += max(delay, 0.02)
            frames.append(UIImage(cgImage: cg))
        }
        guard !frames.isEmpty else {
            DispatchQueue.main.async { onFinished() }
            return view
        }

        view.image = frames.last          // shown when the animation stops
        view.animationImages = frames
        view.animationDuration = total
        view.animationRepeatCount = 1
        view.startAnimating()
        // Let the last frame breathe for a beat before handing over.
        DispatchQueue.main.asyncAfter(deadline: .now() + total + 0.6) { onFinished() }
        return view
    }

    func updateUIView(_ uiView: UIImageView, context: Context) {}
}
