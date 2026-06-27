import SwiftUI

/// Write a memory for a pairing — "times i [event] [twist]" — and see the
/// memories you've already written on this same pairing beneath it.
struct ComposerSheet: View {
    let pairing: Pairing
    let boardDay: Int

    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var saving = false
    @State private var error: String?
    @State private var existing: [XIMemory] = []

    private var prompt: String {
        "times i \(pairing.event.cap.lowercased()) \(pairing.twist.cap.lowercased())"
    }
    private var pairKey: String { "\(pairing.event.id)__\(pairing.twist.id)" }

    var body: some View {
        VStack(spacing: 14) {
            Text(prompt)
                .font(.system(.title3, design: .serif))
                .multilineTextAlignment(.center)
                .foregroundStyle(XITheme.ink)
                .padding(.top, 22)
                .padding(.horizontal, 8)

            TextEditor(text: $text)
                .font(.system(.body, design: .serif))
                .frame(height: 120)
                .padding(8)
                .scrollContentBackground(.hidden)
                .background(XITheme.white)
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(XITheme.line))

            if let error { Text(error).font(.footnote).foregroundStyle(.red) }

            Button(action: save) {
                Text(saving ? "saving…" : "save")
                    .font(.system(.body, design: .serif))
                    .padding(.horizontal, 28).padding(.vertical, 10)
                    .background(XITheme.gold).foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
            }
            .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || saving)
            .opacity(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.5 : 1)

            if !existing.isEmpty {
                Divider().padding(.vertical, 2)
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("the times before")
                            .font(.system(.footnote, design: .serif)).foregroundStyle(XITheme.gold)
                        ForEach(existing) { m in
                            Text(m.content)
                                .font(.system(.callout, design: .serif))
                                .foregroundStyle(XITheme.ink)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    .padding(.horizontal, 2)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(20)
        .background(XITheme.paper)
        .presentationDetents([.medium, .large])
        .task { existing = await XIService.shared.memories(pairKey: pairKey) }
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
                text = ""
                existing = await XIService.shared.memories(pairKey: pairKey)
                saving = false
            } catch {
                self.error = error.localizedDescription
                saving = false
            }
        }
    }
}
