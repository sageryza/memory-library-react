import SwiftUI
import UIKit

/// The Deck Factory autoscroll pill (copied from imageforge
/// ios/ImageForge/AutoScrollPill.swift — keep the speeds/behavior in sync).
/// On play it finds the visible UIScrollView under the key window (largest
/// scrollable one on screen) and drives its contentOffset with a CADisplayLink.
/// Idle: ▲ up / ▶ play / ▼ down; playing: − slower / ‖ pause / + faster over
/// the five discrete speeds (default Fast).
final class AutoScrollDriver: NSObject, ObservableObject, UIGestureRecognizerDelegate {
    /// Shared instance so screens can stop autoscroll on interaction.
    static let shared = AutoScrollDriver()

    @Published var playing = false
    @Published var speedIndex = 2               // 0 slow · 1 medium · 2 fast (default) · 3 faster · 4 fastest
    var direction: Double = 1
    /// The pill's on-screen frame (global/window coords), kept current by
    /// AutoScrollPill — taps inside it are the pill's own controls.
    var pillFrame: CGRect = .zero

    /// Five discrete speeds instead of a continuous dial — same ladder as the
    /// Deck Factory web pill: Slow / Medium / Fast / Faster / Fastest.
    static let speeds: [(label: String, value: Double)] = [("Slow", 0.5), ("Medium", 1.0), ("Fast", 1.9), ("Faster", 3.2), ("Fastest", 5.2)]
    var speed: Double { Self.speeds[speedIndex].value }
    var speedLabel: String { Self.speeds[speedIndex].label }
    func slower() { speedIndex = max(0, speedIndex - 1) }
    func faster() { speedIndex = min(Self.speeds.count - 1, speedIndex + 1) }

    private var link: CADisplayLink?
    private var lastTime: CFTimeInterval?
    private weak var target: UIScrollView?
    private var tapCatcher: UITapGestureRecognizer?

    func toggle() { playing ? stop() : start(direction == 0 ? 1 : direction) }

    func start(_ dir: Double) {
        direction = dir
        target = Self.findScrollView()
        guard target != nil else { return }
        playing = true
        lastTime = nil
        link?.invalidate()
        let l = CADisplayLink(target: self, selector: #selector(tick))
        l.add(to: .main, forMode: .common)
        link = l
        installTapCatcher()
    }

    func stop() {
        playing = false
        link?.invalidate()
        link = nil
        lastTime = nil
        removeTapCatcher()
    }

    // A tap ANYWHERE on content stops autoscroll — on every screen, without
    // per-screen wiring. (Restart is the pill's play button: the catcher only
    // exists while playing, and a stopped-tap-starts rule would make every
    // ordinary tap kick the page scrolling.) cancelsTouchesInView=false so the
    // tap still does what it was going to do (open a memo, press a button); the
    // pill's own frame is filtered out in shouldReceive so −/‖/+ keep working
    // while playing.
    private func installTapCatcher() {
        removeTapCatcher()
        guard let window = target?.window ?? Self.keyWindow() else { return }
        let t = UITapGestureRecognizer(target: self, action: #selector(contentTapped))
        t.cancelsTouchesInView = false
        t.delegate = self
        window.addGestureRecognizer(t)
        tapCatcher = t
    }

    private func removeTapCatcher() {
        if let t = tapCatcher { t.view?.removeGestureRecognizer(t) }
        tapCatcher = nil
    }

    @objc private func contentTapped() { stop() }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                           shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool { true }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        guard let window = gestureRecognizer.view else { return true }
        return !pillFrame.insetBy(dx: -8, dy: -8).contains(touch.location(in: window))
    }

    @objc private func tick(_ l: CADisplayLink) {
        guard playing else { return }
        guard let sv = target, sv.window != nil else {
            // The screen changed under us — STOP. Autoscroll never re-targets
            // and follows you onto a different page.
            stop()
            return
        }
        defer { lastTime = l.timestamp }
        guard let last = lastTime else { return }
        let dt = l.timestamp - last
        let delta = CGFloat(direction * 42.0 * speed * dt)
        let minY = -sv.adjustedContentInset.top
        let maxY = max(minY, sv.contentSize.height + sv.adjustedContentInset.bottom - sv.bounds.height)
        var y = sv.contentOffset.y + delta
        if y <= minY { y = minY }
        if y >= maxY { y = maxY }
        sv.contentOffset.y = y
        if (direction > 0 && y >= maxY) || (direction < 0 && y <= minY) { stop() }
    }

    static func keyWindow() -> UIWindow? {
        UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .flatMap({ $0.windows })
            .first(where: { $0.isKeyWindow })
    }

    /// The biggest scrollable, visible UIScrollView on screen right now.
    /// (RootView keeps every tab mounted at opacity 0 — the alpha check is what
    /// keeps a hidden tab's scroll view from being picked.)
    static func findScrollView() -> UIScrollView? {
        guard let window = keyWindow() else { return nil }
        var best: UIScrollView?
        var bestArea: CGFloat = 0
        func walk(_ v: UIView) {
            if v.isHidden || v.alpha < 0.05 { return }
            if let sv = v as? UIScrollView, !(v is UITextView) {
                let frame = v.convert(v.bounds, to: window)
                let visible = frame.intersection(window.bounds)
                let scrollable = sv.contentSize.height > sv.bounds.height + 40
                if scrollable, visible.height > 200 {
                    let area = visible.width * visible.height
                    if area > bestArea { bestArea = area; best = sv }
                }
            }
            for sub in v.subviews { walk(sub) }
        }
        walk(window)
        return best
    }
}

struct AutoScrollPill: View {
    @ObservedObject private var driver = AutoScrollDriver.shared

    var body: some View {
        VStack(spacing: 6) {
            VStack(spacing: 0) {
                pillButton(driver.playing ? "minus" : "chevron.up",
                           dim: driver.playing && driver.speedIndex == 0) {
                    if driver.playing { driver.slower() } else { driver.start(-1) }
                }
                Rectangle().fill(MemoTheme.ink).frame(width: 46, height: 1.5)
                pillButton(driver.playing ? "pause.fill" : "play.fill", accent: driver.playing) {
                    driver.toggle()
                }
                Rectangle().fill(MemoTheme.ink).frame(width: 46, height: 1.5)
                pillButton(driver.playing ? "plus" : "chevron.down",
                           dim: driver.playing && driver.speedIndex == AutoScrollDriver.speeds.count - 1) {
                    if driver.playing { driver.faster() } else { driver.start(1) }
                }
            }
            .background(MemoTheme.paper)
            .clipShape(Capsule())
            .overlay(Capsule().stroke(MemoTheme.ink, lineWidth: 1.5))
            .shadow(color: .black.opacity(0.09), radius: 5, y: 2)

            Text(driver.speedLabel)
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(MemoTheme.sub)
        }
        // Keep the driver's tap-catcher exclusion zone in sync with where the
        // pill actually is, so its own buttons never count as a content tap.
        .background(GeometryReader { geo -> Color in
            let frame = geo.frame(in: .global)
            DispatchQueue.main.async { AutoScrollDriver.shared.pillFrame = frame }
            return Color.clear
        })
        .onDisappear { driver.stop() }
    }

    private func pillButton(_ icon: String, accent: Bool = false, dim: Bool = false,
                            action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .medium))
                .foregroundColor(accent ? MemoTheme.accent : MemoTheme.ink.opacity(dim ? 0.3 : 1))
                .frame(width: 46, height: 46)
                .background(accent ? MemoTheme.accent.opacity(0.16) : Color.clear)
                .contentShape(Rectangle())   // whole 46×46 is tappable, not just the glyph
        }
        .buttonStyle(.plain)
    }
}
