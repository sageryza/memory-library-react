import SwiftUI

/// Black passport cover with gold-foil lettering that gently hinges open and
/// closed to hint that it opens. Tap to open.
struct CoverView: View {
    let onOpen: () -> Void
    @State private var ajar = false

    var body: some View {
        Button(action: onOpen) {
            Text("LITTLE\nBOOK OF\nMIRACLES")
                .font(.system(.title3, design: .serif).weight(.medium))
                .tracking(3)
                .multilineTextAlignment(.center)
                .lineSpacing(8)
                .foregroundStyle(Theme.gold)
                .padding(.vertical, 22)
                .padding(.horizontal, 24)
                .overlay(Rectangle().stroke(Theme.gold.opacity(0.75), lineWidth: 1.5))
                .frame(width: 256, height: 340)
                .background(
                    LinearGradient(
                        colors: [Color(white: 0.10), Color(white: 0.14), Color(white: 0.045)],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    )
                )
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .shadow(color: .black.opacity(0.55), radius: 26, x: 0, y: 16)
                .rotation3DEffect(
                    .degrees(ajar ? -24 : 0),
                    axis: (x: 0, y: 1, z: 0),
                    anchor: .leading,
                    perspective: 0.6
                )
        }
        .buttonStyle(.plain)
        .onAppear {
            withAnimation(.easeInOut(duration: 2.1).repeatForever(autoreverses: true)) {
                ajar = true
            }
        }
    }
}
