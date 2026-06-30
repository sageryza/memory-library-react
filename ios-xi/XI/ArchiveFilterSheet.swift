import SwiftUI

/// A simple wrapping (flow) layout — chips wrap to the next line when they run
/// out of width. Used for the hashtag cloud and active-tag chips.
struct WrapLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout Void) -> CGSize {
        let maxW = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowH: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x + s.width > maxW, x > 0 { x = 0; y += rowH + spacing; rowH = 0 }
            x += s.width + spacing
            rowH = max(rowH, s.height)
        }
        return CGSize(width: maxW == .infinity ? x : maxW, height: y + rowH)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout Void) {
        let maxW = bounds.width
        var x: CGFloat = 0, y: CGFloat = 0, rowH: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x + s.width > maxW, x > 0 { x = 0; y += rowH + spacing; rowH = 0 }
            v.place(at: CGPoint(x: bounds.minX + x, y: bounds.minY + y), proposal: ProposedViewSize(s))
            x += s.width + spacing
            rowH = max(rowH, s.height)
        }
    }
}

/// The full filter panel: mode, sort, boolean hashtags (tag cloud + active
/// chips with AND/OR toggles), and the advanced AND/OR/NOT search builder.
struct ArchiveFilterSheet: View {
    @ObservedObject var store: ArchiveStore
    @Environment(\.dismiss) private var dismiss
    @State private var saveName = ""
    @State private var showSave = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    modeAndSort
                    if !store.tagFilters.isEmpty { activeChips }
                    tagCloud
                    advancedSection
                }
                .padding(18)
            }
            .background(XITheme.paper.ignoresSafeArea())
            .navigationTitle("filter")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("clear") { store.clearAllFilters() }
                        .font(.system(.body, design: .serif)).tint(XITheme.maroon)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("done") { dismiss() }.font(.system(.body, design: .serif).weight(.semibold)).tint(XITheme.gold)
                }
            }
            .alert("Save as Library", isPresented: $showSave) {
                TextField("Library name", text: $saveName)
                Button("Cancel", role: .cancel) {}
                Button("Save") {
                    let name = saveName.xiTrimmed
                    guard !name.isEmpty else { return }
                    Task { await store.saveAdvancedAsLibrary(name: name); saveName = "" }
                }
            } message: { Text("Re-run this search anytime from Libraries.") }
        }
    }

    // MARK: mode + sort

    private var modeAndSort: some View {
        VStack(alignment: .leading, spacing: 14) {
            label("MODE")
            Picker("Mode", selection: $store.mode) {
                ForEach(ArchiveStore.Mode.allCases) { Text($0.rawValue).tag($0) }
            }.pickerStyle(.segmented)

            label("SORT")
            Picker("Sort", selection: $store.sort) {
                ForEach(ArchiveStore.Sort.allCases) { Text($0.rawValue).tag($0) }
            }.pickerStyle(.segmented)
        }
    }

    // MARK: active boolean tag chips

    private var activeChips: some View {
        VStack(alignment: .leading, spacing: 8) {
            label("ACTIVE TAGS")
            WrapLayout(spacing: 6) {
                ForEach(Array(store.tagFilters.enumerated()), id: \.element.id) { idx, f in
                    HStack(spacing: 6) {
                        if idx > 0 {
                            Button { store.flipOp(f.id) } label: {
                                Text(f.op.rawValue)
                                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                                    .foregroundStyle(XITheme.maroon)
                                    .padding(.horizontal, 6).padding(.vertical, 3)
                                    .background(XITheme.maroon.opacity(0.10))
                                    .clipShape(RoundedRectangle(cornerRadius: 4))
                            }.buttonStyle(.plain)
                        }
                        Button { store.removeTag(f.id) } label: {
                            HStack(spacing: 4) {
                                Text(f.tag).font(.system(size: 12, design: .serif))
                                Image(systemName: "xmark").font(.system(size: 8, weight: .bold))
                            }
                            .foregroundStyle(.white)
                            .padding(.vertical, 5).padding(.horizontal, 9)
                            .background(XITheme.maroon).clipShape(Capsule())
                        }.buttonStyle(.plain)
                    }
                }
            }
        }
    }

    // MARK: tag cloud

    private var cloud: [(tag: String, count: Int)] { store.hashtagCloud() }

    private var tagCloud: some View {
        VStack(alignment: .leading, spacing: 8) {
            label("HASHTAGS")
            if cloud.isEmpty {
                Text("No hashtags yet.").font(.system(.footnote, design: .serif)).foregroundStyle(XITheme.line)
            } else {
                let counts = cloud.map(\.count)
                let lo = counts.min() ?? 1, hi = counts.max() ?? 1
                WrapLayout(spacing: 6) {
                    ForEach(cloud, id: \.tag) { item in
                        Button { store.toggleTag(item.tag) } label: {
                            Text(item.tag)
                                .font(.system(size: cloudSize(item.count, lo, hi), design: .serif))
                                .foregroundStyle(store.isTagActive(item.tag) ? .white : XITheme.maroon)
                                .padding(.vertical, 4).padding(.horizontal, 9)
                                .background(store.isTagActive(item.tag) ? XITheme.maroon : XITheme.maroon.opacity(0.08))
                                .clipShape(Capsule())
                        }.buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func cloudSize(_ count: Int, _ lo: Int, _ hi: Int) -> CGFloat {
        guard hi > lo else { return 13 }
        let t = CGFloat(count - lo) / CGFloat(hi - lo)
        return 11 + t * 7   // 11…18
    }

    // MARK: advanced search

    private var advancedSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Toggle(isOn: $store.advancedOn) {
                Text("Advanced search").font(.system(.headline, design: .serif)).foregroundStyle(XITheme.ink)
            }.tint(XITheme.gold)

            if store.advancedOn {
                termGroup(title: "ALL of these (AND)", terms: $store.advanced.andTerms)
                termGroup(title: "ANY of these (OR)", terms: $store.advanced.orTerms)
                VStack(alignment: .leading, spacing: 6) {
                    label("EXCLUDE (NOT)")
                    TextField("term to exclude", text: $store.advanced.excludeTerms)
                        .textFieldStyle(.roundedBorder).autocorrectionDisabled()
                }
                scopeToggles
                Button { showSave = true } label: {
                    Text("Save as Library")
                        .font(.system(.body, design: .serif).weight(.semibold))
                        .foregroundStyle(.white).frame(maxWidth: .infinity)
                        .padding(.vertical, 11).background(XITheme.gold)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                }
                .disabled(store.advanced.isEmpty)
                .opacity(store.advanced.isEmpty ? 0.5 : 1)
            }
        }
    }

    private func termGroup(title: String, terms: Binding<[String]>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            label(title)
            ForEach(Array(terms.wrappedValue.indices), id: \.self) { i in
                HStack(spacing: 6) {
                    TextField("term", text: Binding(
                        get: { i < terms.wrappedValue.count ? terms.wrappedValue[i] : "" },
                        set: { if i < terms.wrappedValue.count { terms.wrappedValue[i] = $0 } }))
                        .textFieldStyle(.roundedBorder).autocorrectionDisabled()
                    Button { if i < terms.wrappedValue.count { terms.wrappedValue.remove(at: i) } } label: {
                        Image(systemName: "minus.circle").foregroundStyle(XITheme.line)
                    }
                }
            }
            Button { terms.wrappedValue.append("") } label: {
                Label("Add term", systemImage: "plus.circle").font(.system(.footnote, design: .serif)).tint(XITheme.gold)
            }
        }
    }

    private var scopeToggles: some View {
        VStack(alignment: .leading, spacing: 6) {
            label("SEARCH IN")
            WrapLayout(spacing: 8) {
                scopeChip("Titles", $store.advanced.searchInTitles)
                scopeChip("Content", $store.advanced.searchInContent)
                scopeChip("Hashtags", $store.advanced.searchInHashtags)
                scopeChip("Dates", $store.advanced.searchInDates)
            }
        }
    }

    private func scopeChip(_ title: String, _ on: Binding<Bool>) -> some View {
        Button { on.wrappedValue.toggle() } label: {
            HStack(spacing: 4) {
                Image(systemName: on.wrappedValue ? "checkmark.square.fill" : "square")
                    .font(.system(size: 12))
                Text(title).font(.system(size: 13, design: .serif))
            }
            .foregroundStyle(on.wrappedValue ? XITheme.gold : XITheme.line)
            .padding(.vertical, 5).padding(.horizontal, 9)
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(on.wrappedValue ? XITheme.gold : XITheme.line, lineWidth: 1))
        }.buttonStyle(.plain)
    }

    private func label(_ s: String) -> some View {
        Text(s).font(.system(size: 11, weight: .semibold, design: .monospaced))
            .tracking(1).foregroundStyle(XITheme.navInk)
    }
}
