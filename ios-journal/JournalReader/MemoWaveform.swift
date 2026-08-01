import SwiftUI
import AVFoundation

/// Amplitude buckets for a local audio file — one normalized RMS value per bar
/// of the waveform. Runs off the main thread; returns nil if the file can't be
/// decoded (the view then shows flat placeholder bars, still scrubbable).
enum WaveformLoader {
    static func samples(from url: URL, buckets: Int = 96) async -> [Float]? {
        await Task.detached(priority: .utility) { () -> [Float]? in
            guard let file = try? AVAudioFile(forReading: url) else { return nil }
            let totalFrames = Int(file.length)
            guard totalFrames > 0 else { return nil }
            let perBucket = max(1, totalFrames / buckets)
            guard let buf = AVAudioPCMBuffer(pcmFormat: file.processingFormat,
                                             frameCapacity: AVAudioFrameCount(perBucket)) else { return nil }
            var out: [Float] = []
            out.reserveCapacity(buckets)
            for _ in 0..<buckets {
                do { try file.read(into: buf, frameCount: AVAudioFrameCount(perBucket)) }
                catch { break }
                guard buf.frameLength > 0, let data = buf.floatChannelData else { break }
                let n = Int(buf.frameLength)
                let ch = data[0]
                var sum: Float = 0
                for i in 0..<n { let v = ch[i]; sum += v * v }
                out.append(sqrt(sum / Float(n)))
            }
            guard let peak = out.max(), peak > 0 else { return nil }
            return out.map { min(1, $0 / peak) }
        }.value
    }
}

/// The recording's waveform with the played portion tinted. Drag (or tap)
/// anywhere to scrub: `onScrub` fires while the finger moves so the bars can
/// follow it, `onScrubEnd` fires once with the landing fraction.
struct MemoWaveformView: View {
    let samples: [Float]?     // nil = still loading → flat placeholder bars
    let progress: Double      // 0…1 played
    let tint: Color
    let onScrub: (Double) -> Void
    let onScrubEnd: (Double) -> Void

    var body: some View {
        GeometryReader { geo in
            let bars = samples ?? Array(repeating: 0.28, count: 96)
            Canvas { ctx, size in
                let n = bars.count
                let step = size.width / CGFloat(n)
                let barW = max(1.5, step * 0.62)
                let played = Int((progress * Double(n)).rounded())
                for i in 0..<n {
                    let h = max(3, CGFloat(bars[i]) * (size.height - 4))
                    let x = CGFloat(i) * step + (step - barW) / 2
                    let rect = CGRect(x: x, y: (size.height - h) / 2, width: barW, height: h)
                    ctx.fill(Path(roundedRect: rect, cornerRadius: barW / 2),
                             with: .color(i < played ? tint : MemoTheme.line))
                }
            }
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { g in onScrub(fraction(g.location.x, geo.size.width)) }
                    .onEnded { g in onScrubEnd(fraction(g.location.x, geo.size.width)) }
            )
        }
        .frame(height: 44)
        .accessibilityLabel("Waveform — drag to skip around")
    }

    private func fraction(_ x: CGFloat, _ width: CGFloat) -> Double {
        guard width > 0 else { return 0 }
        return Double(min(1, max(0, x / width)))
    }
}
