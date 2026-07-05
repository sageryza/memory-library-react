import SwiftUI

/// One miracle: a square drawing frame with the draw / undo / redo controls in
/// its bottom-right corner, and a handwritten caption on ruled lines beneath.
struct BoxView: View {
    @ObservedObject var store: MiraclesStore
    let box: MiracleBox
    @Binding var distill: Bool
    /// Called when this box's caption gains focus, so the page can scroll it
    /// above the keyboard.
    var onCaptionFocus: (String) -> Void = { _ in }

    @State private var drawing = false
    @State private var errorText: String?
    @State private var showConsent = false
    @FocusState private var captionFocused: Bool
    // 5.1.2(i): one-time consent before any text is sent to third-party AI.
    @AppStorage("miracles.aiConsent.v1") private var aiConsentAccepted = false

    // No extra lineSpacing: SwiftUI's 3-line reserved height does NOT include
    // added line spacing, so any extra pushed the third line out of the box
    // (and the h/3 rules through the text). With the font's natural line
    // height, text and rules agree by construction.
    private static let captionFontSize: CGFloat = 20

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

                // Controls stay tucked away; tapping the drawing surfaces them
                // (and tapping anywhere else puts them back — see BookView).
                // A box with text but no drawing yet always shows "draw".
                if showsControls {
                    // Keep ✓ — top-right, only once there's a drawing to keep.
                    if box.url != nil {
                        VStack {
                            HStack { Spacer(); keepButton }
                            Spacer()
                        }
                        .padding(5)
                    }
                    // Draw / redraw + pick arrows — bottom-right.
                    VStack {
                        Spacer()
                        HStack { Spacer(); controls }
                    }
                    .padding(5)
                }
            }
            .aspectRatio(1, contentMode: .fit)
            .clipped()
            .contentShape(Rectangle())
            .onTapGesture {
                // Tap the drawing to toggle its edit controls.
                guard box.url != nil else { return }
                store.activeBoxID = (store.activeBoxID == box.id) ? nil : box.id
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
        // The field's own 3-line reservation defines the height, and the ruled
        // lines are drawn at thirds of that REAL height — so text and rules can
        // never drift apart (a fixed 28pt/34pt guess clipped the third line).
        // Keyboard "Done" is declared once at the BookView level.
        TextField(
            "",
            text: Binding(get: { box.text }, set: { store.setText($0, boxID: box.id) }),
            axis: .vertical
        )
        .focused($captionFocused)
        .lineLimit(3, reservesSpace: true)
        .font(.custom(Theme.handwriting, size: Self.captionFontSize))
        .foregroundStyle(Theme.captionInk)
        .tint(Theme.gold)
        .padding(.horizontal, 2)
        .background {
            GeometryReader { geo in
                RuledLines(spacing: geo.size.height / 3)
            }
        }
        .id("caption-\(box.id)")
        .onChange(of: captionFocused) { focused in
            if focused { onCaptionFocus(box.id) }
        }
    }

    // Show the draw button only once there's something to draw — text typed,
    // or an existing drawing to redraw.
    private var canDraw: Bool {
        box.url != nil || !box.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    // No drawing yet → "draw" shows as soon as there's text (there's no picture
    // to tap). Once a drawing exists, controls appear only while this box is
    // the active one (tapped).
    private var showsControls: Bool {
        box.url == nil ? canDraw : store.activeBoxID == box.id
    }

    private var controls: some View {
        HStack(spacing: 4) {
            if box.canUndo {
                arrow("arrowtriangle.backward.fill") { store.step(-1, boxID: box.id) }
            }

            if canDraw {
                Button(action: draw) {
                    HStack(spacing: 4) {
                        Text(box.url == nil ? "draw" : "redraw")
                        Image(systemName: "sparkles")
                    }
                    .lineLimit(1)
                    .fixedSize()                    // never wrap "redraw" to letters
                    .font(.custom(Theme.serif, size: 15))
                    .foregroundStyle(Theme.serifInk)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 3)
                    .background(.white.opacity(0.85))
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(Theme.line))
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                }
                .buttonStyle(.plain)
                .disabled(drawing)
            }

            if box.canRedo {
                arrow("arrowtriangle.forward.fill") { store.step(1, boxID: box.id) }
            }

            // A higher-quality render of THIS drawing is ready — step up to it.
            if let current = box.url, box.upgrades[current] != nil {
                arrow("arrowtriangle.up.fill") { store.applyUpgrade(boxID: box.id) }
            }
        }
    }

    // Keep the shown drawing: locks it in and tucks the edit controls away.
    private var keepButton: some View {
        Button {
            store.setSelected(true, boxID: box.id)
            store.activeBoxID = nil
        } label: {
            Image(systemName: "checkmark")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(Theme.gold)
                .frame(width: 24, height: 24)
                .background(.white.opacity(0.85))
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(Theme.gold.opacity(0.6)))
                .clipShape(RoundedRectangle(cornerRadius: 6))
        }
        .buttonStyle(.plain)
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
                // One draw returns a few concept options on the FAST tier
                // (~10s); the ‹/› arrows let you pick among them.
                let result = try await MiraclesService.shared.illustrate(
                    text: text, boxID: box.id, distill: distill, variants: 3, tier: "fast"
                )
                store.pushDrawings(result.urls, boxID: box.id)
                // Meanwhile, quietly render the primary concept at the higher
                // tiers. When one lands, ▲ appears on that drawing.
                if let primary = result.options.first, !primary.drawing.isEmpty {
                    launchUpgrades(for: primary, text: text)
                }
            } catch {
                errorText = error.localizedDescription
            }
            drawing = false
        }
    }

    /// Background quality ladder: same concept, better models. Best-effort —
    /// failures are silent (the fast drawing is already on the page).
    private func launchUpgrades(for option: MiraclesService.DrawOption, text: String) {
        let boxID = box.id
        for (tier, isBest) in [("better", false), ("best", true)] {
            Task {
                if let up = try? await MiraclesService.shared.illustrate(
                    text: text, boxID: boxID, distill: false, variants: 1,
                    tier: tier, concept: option.drawing
                ), let url = up.urls.first {
                    store.addUpgrade(boxID: boxID, base: option.url, new: url, isBest: isBest)
                }
            }
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
