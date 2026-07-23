import SwiftUI
import FirebaseAuth

/// "stories i tell" — the mandatory public library every account has: stories
/// told in Versus (public by default) and memories their owners chose to
/// share. Your own entries can be made private right here (they leave the
/// public library; your archive copy stays). Others' entries can be reported.
struct StoriesITellView: View {
    @State private var stories: [XIService.PublicOther] = []
    @State private var loading = true
    @State private var reporting: XIService.PublicOther?
    @State private var busyId: String?

    private var uid: String? { Auth.auth().currentUser?.uid }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("Stories people tell — from Versus games and memories shared to the world. Your own can be made private anytime.")
                    .font(.system(.footnote, design: .serif)).foregroundStyle(XITheme.line)
                    .padding(.bottom, 4)
                if loading {
                    ProgressView().tint(XITheme.gold).frame(maxWidth: .infinity).padding(.top, 30)
                } else if stories.isEmpty {
                    Text("No public stories yet.")
                        .font(.system(.body, design: .serif)).foregroundStyle(XITheme.line)
                        .frame(maxWidth: .infinity).padding(.top, 30)
                } else {
                    ForEach(stories) { s in storyCard(s) }
                }
            }
            .padding(16)
            .frame(maxWidth: 560).frame(maxWidth: .infinity)
        }
        .background(XITheme.paper.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Text("stories i tell")
                    .font(.system(.headline, design: .serif)).foregroundStyle(XITheme.ink)
            }
        }
        .task { stories = await XIService.shared.storiesITell(); loading = false }
        .sheet(item: $reporting) { other in
            ReportSheet(
                subjectLabel: "story",
                onSubmit: { reason, details in
                    Task { try? await XIService.shared.reportPublicMemory(other, reason: reason, details: details) }
                    reporting = nil
                },
                onCancel: { reporting = nil })
        }
    }

    private func storyCard(_ s: XIService.PublicOther) -> some View {
        let mine = uid != nil && s.byUid == uid
        return VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(mine ? "you" : s.byName)
                    .font(.system(.caption, design: .serif)).foregroundStyle(XITheme.gold)
                Spacer()
                if mine {
                    Button {
                        makePrivate(s)
                    } label: {
                        Text(busyId == s.id ? "…" : "make private")
                            .font(.system(.caption, design: .serif)).foregroundStyle(XITheme.line)
                    }
                    .disabled(busyId != nil)
                } else {
                    Button { reporting = s } label: {
                        Image(systemName: "flag").font(.system(size: 11)).foregroundStyle(XITheme.line)
                    }
                    .accessibilityLabel("Report this story")
                }
            }
            Text(s.content)
                .font(.system(.body, design: .serif)).foregroundStyle(XITheme.ink)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(XITheme.white)
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .overlay(RoundedRectangle(cornerRadius: 6).stroke(XITheme.line, lineWidth: 0.5))
    }

    /// Public docs are keyed "<uid>_<memoryId>" by the publish function —
    /// unpublishing goes back through it so the archive copy flips too.
    private func makePrivate(_ s: XIService.PublicOther) {
        guard let uid, s.id.hasPrefix("\(uid)_") else { return }
        let memoryId = String(s.id.dropFirst(uid.count + 1))
        busyId = s.id
        Task {
            _ = await XIService.shared.setMemoryVisibility(memoryId, isPublic: false)
            stories.removeAll { $0.id == s.id }
            busyId = nil
        }
    }
}
