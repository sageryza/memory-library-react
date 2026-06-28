import SwiftUI
import UIKit

/// Opening title sequence: the sword plummets out of the sky and strikes the
/// cloud (impact shake + motion lines + sparkles + haptic), then "SIDE QUEST"
/// lands. Plays over the app on launch, then fades into the main tabs.
/// Tap anywhere to skip.
struct IntroView: View {
    var onDone: () -> Void

    @State private var dropped = false      // sword fell into the cloud
    @State private var struck = false       // impact effects fired
    @State private var showTitle = false
    @State private var shake: CGFloat = 0    // vertical "thunk" wobble
    @State private var finished = false

    // sky-blue brand backdrop (matches the icon / key art)
    private let skyTop = Color(hex: 0x4A9FD8)
    private let skyBot = Color(hex: 0x8FC9EA)

    var body: some View {
        ZStack {
            LinearGradient(colors: [skyTop, skyBot], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()

            // drifting background clouds
            Image("sq_cloud").resizable().scaledToFit().frame(width: 150)
                .opacity(0.55).offset(x: -120, y: -230)
            Image("sq_cloud").resizable().scaledToFit().frame(width: 110)
                .opacity(0.45).offset(x: 130, y: -300)

            // hero: cloud + landed sword
            ZStack {
                Image("sq_cloud").resizable().scaledToFit().frame(width: 300)
                    .scaleEffect(x: struck ? 1.06 : 1, y: struck ? 0.92 : 1, anchor: .bottom)
                    .offset(y: 120)

                strikeFX.offset(x: 18, y: 28)

                Image("sq_sword").resizable().scaledToFit().frame(width: 150)
                    .rotationEffect(.degrees(-15))
                    .offset(y: dropped ? -28 : -760)
            }
            .offset(y: -40 - shake)

            // title card
            VStack(spacing: 10) {
                Text("SIDE QUEST")
                    .font(SQ.pixel(30)).foregroundStyle(.white)
                    .shadow(color: Color(hex: 0x183654), radius: 0, x: 3, y: 3)
                    .multilineTextAlignment(.center)
                Text("Find Purpose in Purposelessness")
                    .font(SQ.term(22)).foregroundStyle(.white.opacity(0.92))
            }
            .offset(y: 215)
            .opacity(showTitle ? 1 : 0)
            .scaleEffect(showTitle ? 1 : 0.8)
        }
        .contentShape(Rectangle())
        .onTapGesture { finish() }
        .task { await run() }
    }

    /// Gold motion lines + sparkles at the point of impact (matches the icon).
    private var strikeFX: some View {
        ZStack {
            ForEach(0..<3) { i in
                Capsule().fill(SQ.gold)
                    .frame(width: 6, height: 26)
                    .rotationEffect(.degrees(-35))
                    .offset(x: -70 - CGFloat(i) * 16, y: -36 + CGFloat(i) * 14)
            }
            Image(systemName: "sparkle").font(.system(size: 26)).foregroundStyle(SQ.gold)
                .offset(x: 64, y: -10)
            Image(systemName: "sparkle").font(.system(size: 16)).foregroundStyle(.white)
                .offset(x: 40, y: 30)
        }
        .opacity(struck ? 1 : 0)
        .scaleEffect(struck ? 1 : 0.3)
    }

    @MainActor private func run() async {
        try? await Task.sleep(nanoseconds: 350_000_000)
        withAnimation(.easeIn(duration: 0.42)) { dropped = true }
        try? await Task.sleep(nanoseconds: 420_000_000)

        // impact
        UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
        withAnimation(.spring(response: 0.25, dampingFraction: 0.45)) { struck = true }
        shake = 16
        withAnimation(.interpolatingSpring(stiffness: 550, damping: 7)) { shake = 0 }

        try? await Task.sleep(nanoseconds: 160_000_000)
        withAnimation(.spring(response: 0.4, dampingFraction: 0.6)) { showTitle = true }

        try? await Task.sleep(nanoseconds: 1_700_000_000)
        finish()
    }

    private func finish() {
        guard !finished else { return }
        finished = true
        onDone()
    }
}
