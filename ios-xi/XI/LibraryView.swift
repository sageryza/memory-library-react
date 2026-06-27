import SwiftUI

/// Browse all the XI memories you've written, newest first, grouped by pairing.
struct LibraryView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var memories: [XIMemory] = []
    @State private var loading = true

    private var groups: [(key: String, title: String, items: [XIMemory])] {
        let byPair = Dictionary(grouping: memories, by: { $0.pairKey })
        return byPair
            .map { (key: $0.key, title: $0.value.first.map { "times i \($0.eventCap.lowercased()) \($0.twistCap.lowercased())" } ?? "", items: $0.value) }
            .sorted { ($0.items.first?.timestamp ?? "") > ($1.items.first?.timestamp ?? "") }
    }

    var body: some View {
        NavigationStack {
            Group {
                if loading {
                    ProgressView().tint(XITheme.gold)
                } else if memories.isEmpty {
                    Text("No memories yet.\nTap two touching cards on the board to write one.")
                        .font(.system(.body, design: .serif))
                        .foregroundStyle(XITheme.line)
                        .multilineTextAlignment(.center)
                        .padding()
                } else {
                    List {
                        ForEach(groups, id: \.key) { group in
                            Section {
                                ForEach(group.items) { m in
                                    Text(m.content)
                                        .font(.system(.body, design: .serif))
                                        .foregroundStyle(XITheme.ink)
                                        .listRowBackground(XITheme.paper)
                                }
                            } header: {
                                Text(group.title)
                                    .font(.system(.subheadline, design: .serif))
                                    .foregroundStyle(XITheme.gold)
                                    .textCase(nil)
                            }
                        }
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(XITheme.paper.ignoresSafeArea())
            .navigationTitle("your memories")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("done") { dismiss() }.font(.system(.body, design: .serif)).tint(XITheme.gold)
                }
            }
        }
        .task {
            memories = await XIService.shared.allXiMemories()
            loading = false
        }
    }
}
