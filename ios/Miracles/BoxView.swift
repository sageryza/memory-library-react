import SwiftUI

/// One miracle: a square drawing frame with the draw / undo / redo controls in
/// its bottom-right corner, and a handwritten caption on ruled lines beneath.
struct BoxView: View {
    @ObservedObject var store: MiraclesStore
    let box: MiracleBox
    @Binding var distill: Bool

    @State private var drawing = false
    @State private var errorText: String?
    @State private var showConsent = false
    @FocusState private var captionFocused: Bool
    // 5.1.2(i): one-time consent before any text is sent to third-party AI.
    @AppStorage("miracles.aiConsent.v1") private var aiConsentAccepted = false

    private let lineHeight: CGFloat = 28

    var body: some View {
        VStack(spacing: 6) {
            ZStack {
                Rectangle()
                    .fill(Color.white)
                    .overlay(Rectangle().stroke(Theme.line, lineWidth: 1))

                if let urlString = box.url {
                    // Disk-cached loader: shows instantly on relaunch, survives a
                    // dead URL, and offers "tap to redraw" instead of an endless spinner.
                    CachedDoodleImage(urlString: urlString, onRetry: draw)
                        .padding(2)
                }

                if drawing { ProgressView().tint(Theme.gold) }

                // Edit controls hide once you've locked in a drawing.
                if !box.selected {
                    VStack {
                        Spacer()
                        HStack {
                            Spacer()
                            controls
                        }
                    }
                    .padding(5)
                }
            }
            .aspectRatio(1, contentMode: .fit)
            .clipped()
            .contentShape(Rectangle())
            .onTapGesture {
                // Tap a locked-in drawing to bring the edit controls back.
                if box.selected { store.setSelected(false, boxID: box.id) }
            }

            caption

            if let errorText {
                Text(errorText)
                    .font(.caption2).foregroundStyle(.red)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .sheet(isPresented: $showConsent) {
            AIConsentSheet(
                theme: .miracles,
                appName: "Miracles",
                providers: [
                    AIProvider(name: "Anthropic (Claude)", role: "Turns your words into a drawing prompt"),
                    AIProvider(name: "Replicate", role: "Generates the illustration"),
                ],
                dataDescription: "the text you write",
                privacyURL: URL(string: "https://incaseofamnesia.com/privacy.html"),
                onAgree: {
                    aiConsentAccepted = true
                    showConsent = false
                    performDraw()
                },
                onCancel: { showConsent = false }
            )
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
            .focused($captionFocused)
            .lineLimit(3, reservesSpace: true)
            .lineSpacing(9)
            .font(.custom(Theme.handwriting, size: 20))
            .foregroundStyle(Theme.captionInk)
            .tint(Theme.gold)
            .padding(.horizontal, 2)
            .offset(y: 1)
            // The caption is multi-line, so Return makes a new line rather than
            // dismissing — give an explicit way to put the keyboard away.
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { captionFocused = false }
                }
            }
        }
        .frame(height: lineHeight * 3)
    }

    private var controls: some View {
        HStack(spacing: 4) {
            if box.canUndo {
                arrow("arrowtriangle.backward.fill") { store.step(-1, boxID: box.id) }
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
                arrow("arrowtriangle.forward.fill") { store.step(1, boxID: box.id) }
            }

            // Keep this one: locks the drawing in and hides these controls.
            if box.url != nil {
                Button { store.setSelected(true, boxID: box.id) } label: {
                    Image(systemName: "checkmark")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(Theme.gold)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 4)
                        .background(.white.opacity(0.85))
                        .overlay(RoundedRectangle(cornerRadius: 6).stroke(Theme.gold.opacity(0.6)))
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                }
                .buttonStyle(.plain)
            }
        }
    }

    // Small filled arrow — no circle, deliberately unobtrusive.
    private func arrow(_ symbol: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 11))
                .foregroundStyle(Theme.muted)
                .frame(width: 20, height: 24)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    /// Gate the draw on AI consent (5.1.2(i)); on first use, ask before sending.
    private func draw() {
        let text = box.text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !drawing else { return }
        if !aiConsentAccepted { showConsent = true; return }
        performDraw()
    }

    private func performDraw() {
        let text = box.text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !drawing else { return }
        drawing = true
        errorText = nil
        Task {
            do {
                // One draw returns a few concept options; the ‹/› arrows let
                // you pick among them.
                let result = try await MiraclesService.shared.illustrate(
                    text: text, boxID: box.id, distill: distill, variants: 3
                )
                store.pushDrawings(result.urls, boxID: box.id)
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
