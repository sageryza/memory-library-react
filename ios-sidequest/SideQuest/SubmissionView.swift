import SwiftUI
import PhotosUI

struct SubmissionView: View {
    let quest: Quest
    var onSubmit: (_ story: String, _ image: Data?) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var pick: PhotosPickerItem?
    @State private var imageData: Data?
    @State private var story = ""

    private var canSubmit: Bool { !story.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    var body: some View {
        ZStack {
            SQ.background.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 18) {
                    Text("PROVE IT").font(SQ.pixel(20)).foregroundStyle(SQ.gold).padding(.top, 8)
                    Text(quest.title).font(SQ.term(22)).foregroundStyle(.white)

                    PhotosPicker(selection: $pick, matching: .images) {
                        ZStack {
                            Rectangle().fill(SQ.panel)
                            if let imageData, let ui = UIImage(data: imageData) {
                                Image(uiImage: ui).resizable().scaledToFill()
                            } else {
                                VStack(spacing: 8) {
                                    Image(systemName: "camera.fill").font(.system(size: 34)).foregroundStyle(SQ.gold)
                                    Text("ADD PHOTO PROOF").font(SQ.pixel(10)).foregroundStyle(.white.opacity(0.8))
                                }
                            }
                        }
                        .frame(height: 220).clipped()
                        .overlay(Rectangle().stroke(SQ.gold, lineWidth: 3))
                    }

                    PixelPanel(border: .white.opacity(0.3)) {
                        ZStack(alignment: .topLeading) {
                            if story.isEmpty {
                                Text("Tell the tale of your quest…")
                                    .font(SQ.term(20)).foregroundStyle(.white.opacity(0.4))
                                    .padding(.top, 8).padding(.leading, 5)
                            }
                            TextEditor(text: $story)
                                .font(SQ.term(20)).foregroundStyle(.white)
                                .scrollContentBackground(.hidden).frame(minHeight: 130)
                        }
                    }

                    Button("⊕ POST TO THE HALL") {
                        onSubmit(story.trimmingCharacters(in: .whitespacesAndNewlines), imageData)
                        dismiss()
                    }
                    .buttonStyle(PixelButton(bg: canSubmit ? SQ.green : SQ.panel))
                    .disabled(!canSubmit)

                    Button("cancel") { dismiss() }
                        .font(SQ.term(20)).foregroundStyle(.white.opacity(0.6))
                    Spacer(minLength: 10)
                }
                .padding(16)
                .frame(maxWidth: 480)
                .frame(maxWidth: .infinity)
            }
        }
        .task(id: pick) {
            if let pick, let data = try? await pick.loadTransferable(type: Data.self) { imageData = data }
        }
    }
}

struct SuccessView: View {
    let xp: Int
    @Environment(\.dismiss) private var dismiss
    @State private var pop = false

    var body: some View {
        ZStack {
            SQ.background.ignoresSafeArea()
            VStack(spacing: 22) {
                Text("⭐").font(.system(size: 80)).scaleEffect(pop ? 1 : 0.4)
                    .animation(.spring(response: 0.5, dampingFraction: 0.5), value: pop)
                Text("QUEST COMPLETE!").font(SQ.pixel(20)).foregroundStyle(SQ.gold)
                    .multilineTextAlignment(.center)
                Text("+\(xp) XP").font(SQ.pixel(28)).foregroundStyle(SQ.green)
                Text("Purpose, briefly, achieved.").font(SQ.term(22)).foregroundStyle(.white.opacity(0.85))
                Button("◈ CONTINUE ◈") { dismiss() }
                    .buttonStyle(PixelButton(bg: SQ.teal, fg: SQ.panel))
                    .frame(maxWidth: 260)
            }
            .padding(28)
        }
        .onAppear { pop = true }
    }
}
