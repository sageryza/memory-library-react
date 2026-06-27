import SwiftUI

/// Write a memory for a pairing — "times i [event] [twist]".
struct ComposerSheet: View {
    let pairing: Pairing
    let boardDay: Int

    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var saving = false
    @State private var error: String?

    private var prompt: String {
        "times i \(pairing.event.cap.lowercased()) \(pairing.twist.cap.lowercased())"
    }

    var body: some View {
        VStack(spacing: 16) {
            Text(prompt)
                .font(.system(.title3, design: .serif))
                .multilineTextAlignment(.center)
                .foregroundStyle(XITheme.ink)
                .padding(.top, 26)
                .padding(.horizontal, 8)

            TextEditor(text: $text)
                .font(.system(.body, design: .serif))
                .frame(height: 170)
                .padding(8)
                .scrollContentBackground(.hidden)
                .background(XITheme.white)
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(XITheme.line))

            if let error {
                Text(error).font(.footnote).foregroundStyle(.red)
            }

            Button(action: save) {
                Text(saving ? "saving…" : "save")
                    .font(.system(.body, design: .serif))
                    .padding(.horizontal, 28).padding(.vertical, 10)
                    .background(XITheme.gold)
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
            }
            .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || saving)
            .opacity(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.5 : 1)

            Spacer()
        }
        .padding(20)
        .background(XITheme.paper)
        .presentationDetents([.medium, .large])
    }

    private func save() {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return }
        saving = true; error = nil
        Task {
            do {
                try await XIService.shared.saveMemory(
                    event: pairing.event, twist: pairing.twist, text: t, boardDay: boardDay
                )
                dismiss()
            } catch {
                self.error = error.localizedDescription
                saving = false
            }
        }
    }
}
