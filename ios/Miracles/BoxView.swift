import SwiftUI

/// One miracle: a square drawing frame with its controls, and a handwritten
/// caption on ruled lines beneath.
struct BoxView: View {
    @ObservedObject var store: MiraclesStore
    let box: MiracleBox
    @Binding var distill: Bool
    /// Called when this box's caption gains focus, so the page can scroll it
    /// above the keyboard.
    var onCaptionFocus: (String) -> Void = { _ in }

    @State private var showConsent = false
    @FocusState private var captionFocused: Bool
    // 5.1.2(i): consent before any words are sent to the AI services. It can
    // be withdrawn in Settings; the next draw then asks again.
    @AppStorage(Keys.aiConsent) private var aiConsentAccepted = false

    // No extra lineSpacing: SwiftUI's 3-line reserved height does NOT include
    // added line spacing, so any extra pushed the third line out of the box
    // (and the h/3 rules through the text). With the font's natural line
    // height, text and rules agree by construction.
    private static let captionFontSize: CGFloat = 20

    private var words: String { box.text.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var hasWords: Bool { !words.isEmpty }
    private var drawing: Bool { store.isDrawing(box.id) }
    private var isActive: Bool { store.activeBoxID == box.id }
    /// "Keep this one": the showing drawing is kept, so only the ✓ comes back
    /// when she taps it (tap the ✓ to choose again).
    private var kept: Bool { box.selected && box.url != nil }

    var body: some View {
        VStack(spacing: 6) {
            ZStack {
                Rectangle()
                    .fill(Color.white)
                    .overlay(Rectangle().stroke(Theme.line, lineWidth: 1))

                if let urlString = box.url {
                    // Disk-cached loader: shows instantly on relaunch, and a
                    // failed download offers "Try again" (a download, never a
                    // new paid drawing).
                    CachedDoodleImage(
                        urlString: urlString,
                        label: hasWords ? words : "Drawing",
                        onActivate: toggleControls
                    )
                    .padding(2)
                }

                if drawing { ProgressView().tint(Theme.gold) }

                // Controls stay tucked away; tapping the drawing surfaces them
                // (and tapping anywhere else puts them back — see BookView).
                // A box with words but no drawing yet always shows "draw".
                if box.url == nil {
                    if hasWords { corner(.bottomTrailing) { drawButton } }
                } else if isActive {
                    corner(.topTrailing) { keepButton }
                    if !kept { corner(.bottomTrailing) { editControls } }
                }
            }
            .aspectRatio(1, contentMode: .fit)
            .clipped()
            .contentShape(Rectangle())
            .onTapGesture(perform: toggleControls)

            caption

            if let message = store.drawError(box.id) {
                Text(message)
                    .font(.caption2).foregroundStyle(.red)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .sheet(isPresented: $showConsent) { consentSheet }
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

    private func corner<Content: View>(_ alignment: Alignment, @ViewBuilder _ content: () -> Content) -> some View {
        content()
            .padding(5)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: alignment)
    }

    /// The arrows, redraw and ▲ — shown while the drawing isn't kept. Redraw
    /// needs words; with none it isn't offered.
    private var editControls: some View {
        HStack(spacing: 4) {
            if box.canUndo {
                arrow("arrowtriangle.backward.fill", label: "Previous drawing") { store.step(-1, boxID: box.id) }
            }

            if hasWords { drawButton }

            if box.canRedo {
                arrow("arrowtriangle.forward.fill", label: "Next drawing") { store.step(1, boxID: box.id) }
            }

            // A higher-quality render of THIS drawing is ready — step up to it.
            if let current = box.url, box.upgrades[current] != nil {
                arrow("arrowtriangle.up.fill", label: "Better version") { store.applyUpgrade(boxID: box.id) }
            }
        }
    }

    private var drawButton: some View {
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
        .accessibilityLabel(box.url == nil ? "Draw" : "Redraw")
    }

    /// Keep ✓: keeps the shown drawing and tucks the controls away. While a
    /// drawing is kept, tapping it shows only the ✓ (filled), and tapping that
    /// un-keeps it so the arrows and redraw come back.
    private var keepButton: some View {
        Button {
            if kept {
                store.setSelected(false, boxID: box.id)
            } else {
                store.setSelected(true, boxID: box.id)
                store.activeBoxID = nil
            }
        } label: {
            Image(systemName: "checkmark")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(kept ? Theme.ink : Theme.gold)
                .frame(width: 24, height: 24)
                .background(kept ? Theme.gold : Color.white.opacity(0.85))
                .overlay(RoundedRectangle(cornerRadius: 6).stroke(Theme.gold.opacity(0.6)))
                .clipShape(RoundedRectangle(cornerRadius: 6))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Keep this drawing")
        .accessibilityAddTraits(kept ? AccessibilityTraits.isSelected : AccessibilityTraits())
    }

    // Small filled arrow — no circle, deliberately unobtrusive.
    private func arrow(_ symbol: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 11))
                .foregroundStyle(Theme.muted)
                .frame(width: 20, height: 24)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    private func toggleControls() {
        // Tap the drawing to toggle its controls.
        guard box.url != nil else { return }
        store.activeBoxID = isActive ? nil : box.id
    }

    /// Gate the draw on AI consent (5.1.2(i)); until she agrees, ask first.
    private func draw() {
        guard hasWords, !drawing else { return }
        if !aiConsentAccepted { showConsent = true; return }
        store.draw(boxID: box.id, distill: distill)
    }

    private var consentSheet: some View {
        AIConsentSheet(
            theme: .miracles,
            appName: "Miracles",
            providers: [
                AIProvider(name: "Anthropic (Claude)", role: "Turns your words into a drawing idea"),
                AIProvider(name: "OpenAI", role: "Draws the picture"),
            ],
            dataDescription: "the text you write",
            privacyURL: URL(string: "https://incaseofamnesia.com/privacy.html"),
            onAgree: {
                aiConsentAccepted = true
                showConsent = false
                store.draw(boxID: box.id, distill: distill)
            },
            onCancel: { showConsent = false }
        )
    }
}

/// Soft horizontal writing lines, repeating every `spacing` points — matches
/// the web preview's lined-paper caption.
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
