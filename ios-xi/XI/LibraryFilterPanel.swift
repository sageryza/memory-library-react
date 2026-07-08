import SwiftUI

/// The inline filter dropdown that expands under the search bar (replaces the
/// old modal filter sheet). Everything in the app serif: mode, sort, active
/// tags, the hashtag cloud, and Boolean search. State lives in ArchiveStore, so
/// collapsing/reopening the dropdown never loses a built-up search.
struct LibraryFilterPanel: View {
    @ObservedObject var store: ArchiveStore
    @State private var saveName = ""
    @State private var showSave = false
    @State private var showAllTags = false

    /// How many hashtags to show before "show more" — keeps the (often long) tag
    /// cloud from burying the Boolean search below it.
    private let tagCap = 24

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            segment("SEARCH IN", ArchiveStore.Scope.allCases, selection: $store.scope) { $0.rawValue }
            segment("MODE", ArchiveStore.Mode.allCases, selection: $store.mode) { $0.rawValue }
            segment("SORT", ArchiveStore.Sort.allCases, selection: $store.sort) { $0.rawValue }
            if !store.tagFilters.isEmpty { activeChips }
            tagCloud
            booleanSection

            Button { store.clearAllFilters() } label: {
                HStack(spacing: 5) {
                    Image(systemName: "xmark").font(.system(size: 12, weight: .semibold))
                    Text("clear all").font(.system(.footnote, design: .serif))
                }.foregroundStyle(XITheme.maroon)
            }
        }
        .padding(16)
        .background(XITheme.white)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(XITheme.line.opacity(0.5)))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal, 14)
        .padding(.bottom, 28)
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

    // MARK: serif segmented control (replaces the sans-serif Picker)

    private func segment<T: Hashable & Identifiable>(
        _ title: String, _ options: [T], selection: Binding<T>, _ text: @escaping (T) -> String
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            label(title)
            HStack(spacing: 6) {
                ForEach(options) { opt in
                    let on = selection.wrappedValue == opt
                    Button { selection.wrappedValue = opt } label: {
                        Text(text(opt))
                            .font(.system(.subheadline, design: .serif))
                            .foregroundStyle(on ? .white : XITheme.ink)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 7)
                            .background(on ? XITheme.maroon : XITheme.maroon.opacity(0.08))
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                    }.buttonStyle(.plain)
                }
            }
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
                let shown = showAllTags ? cloud : Array(cloud.prefix(tagCap))
                WrapLayout(spacing: 6) {
                    ForEach(shown, id: \.tag) { item in
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
                if cloud.count > tagCap {
                    Button { withAnimation { showAllTags.toggle() } } label: {
                        Text(showAllTags ? "show fewer" : "show \(cloud.count - tagCap) more…")
                            .font(.system(.footnote, design: .serif)).foregroundStyle(XITheme.gold)
                    }.buttonStyle(.plain).padding(.top, 2)
                }
            }
        }
    }

    private func cloudSize(_ count: Int, _ lo: Int, _ hi: Int) -> CGFloat {
        guard hi > lo else { return 13 }
        return 11 + CGFloat(count - lo) / CGFloat(hi - lo) * 7
    }

    // MARK: Boolean search (short AND/OR boxes + small exclude)

    private var booleanSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Toggle(isOn: $store.advancedOn) {
                Text("Boolean search").font(.system(.headline, design: .serif)).foregroundStyle(XITheme.ink)
            }.tint(XITheme.gold)

            if store.advancedOn {
                termRow("ALL OF THESE", op: "and", terms: $store.advanced.andTerms)
                termRow("ANY OF THESE", op: "or", terms: $store.advanced.orTerms)
                VStack(alignment: .leading, spacing: 6) {
                    label("EXCLUDE")
                    TextField("not…", text: $store.advanced.excludeTerms)
                        .textFieldStyle(.roundedBorder).autocorrectionDisabled()
                        .font(.system(.footnote, design: .serif))
                        .frame(maxWidth: 200)
                }
                HStack {
                    Spacer()
                    Button { showSave = true } label: {
                        HStack(spacing: 5) {
                            Image(systemName: "bookmark").font(.system(size: 11))
                            Text("Save as Library").font(.system(.footnote, design: .serif))
                        }
                        .foregroundStyle(XITheme.gold)
                        .padding(.vertical, 6).padding(.horizontal, 11)
                        .overlay(RoundedRectangle(cornerRadius: 6).stroke(XITheme.gold, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .disabled(store.advanced.isEmpty)
                    .opacity(store.advanced.isEmpty ? 0.4 : 1)
                }
            }
        }
    }

    /// A wrapping row of short term boxes with the operator shown between them.
    private func termRow(_ title: String, op: String, terms: Binding<[String]>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            label(title)
            WrapLayout(spacing: 6) {
                ForEach(Array(terms.wrappedValue.indices), id: \.self) { i in
                    HStack(spacing: 4) {
                        if i > 0 {
                            Text(op).font(.system(size: 10, weight: .bold, design: .monospaced))
                                .foregroundStyle(XITheme.maroon)
                        }
                        TextField("term", text: Binding(
                            get: { i < terms.wrappedValue.count ? terms.wrappedValue[i] : "" },
                            set: { if i < terms.wrappedValue.count { terms.wrappedValue[i] = $0 } }))
                            .textFieldStyle(.roundedBorder).autocorrectionDisabled()
                            .font(.system(.footnote, design: .serif))
                            .frame(width: 96)
                    }
                }
                Button { terms.wrappedValue.append("") } label: {
                    Image(systemName: "plus.circle").foregroundStyle(XITheme.gold)
                }.buttonStyle(.plain)
            }
        }
    }

    private func label(_ s: String) -> some View {
        Text(s).font(.system(size: 11, weight: .semibold, design: .monospaced))
            .tracking(1).foregroundStyle(XITheme.navInk)
    }
}
