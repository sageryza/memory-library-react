import SwiftUI

/// The inline filter dropdown that expands under the search bar. Top to bottom:
/// a small Mine/Both/Others scope toggle, the hashtag cloud (truncated), then
/// Boolean search (always available). State lives in ArchiveStore so collapsing
/// and reopening never loses a built-up search.
struct LibraryFilterPanel: View {
    @ObservedObject var store: ArchiveStore
    @State private var saveName = ""
    @State private var showSave = false
    @State private var showAllTags = false

    /// Roughly three lines of chips before "show more" — keeps the (often long)
    /// tag cloud from burying the Boolean search below it.
    private let tagCap = 15

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Scope toggle sits above the hashtags, aligned right.
            HStack { Spacer(); scopeToggle }
            tagCloud
            if !store.tagFilters.isEmpty { activeChips }
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
        // Generous bottom scroll room so the last controls always clear the
        // bottom nav bar (you can scroll them fully into view).
        .padding(.bottom, 80)
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

    // MARK: scope toggle (Mine · Both · Others)

    private var scopeToggle: some View {
        HStack(spacing: 0) {
            scopeSeg("Mine", .mine)
            scopeSeg("Both", .both)
            scopeSeg("Others", .commons)
        }
        .overlay(RoundedRectangle(cornerRadius: 6).stroke(XITheme.gold.opacity(0.5), lineWidth: 0.75))
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }

    private func scopeSeg(_ title: String, _ s: ArchiveStore.Scope) -> some View {
        let on = store.scope == s
        return Button { withAnimation(.easeInOut(duration: 0.15)) { store.scope = s } } label: {
            Text(title)
                .font(.system(size: 12, design: .serif))
                .foregroundStyle(on ? .white : XITheme.gold)
                .padding(.vertical, 5).padding(.horizontal, 12)
                .background(on ? XITheme.gold : XITheme.gold.opacity(0.10))
        }.buttonStyle(.plain)
    }

    // MARK: active boolean tag chips

    private var activeChips: some View {
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

    // MARK: tag cloud (no label; truncated to ~3 lines)

    private var cloud: [(tag: String, count: Int)] { store.hashtagCloud() }

    private var tagCloud: some View {
        VStack(alignment: .leading, spacing: 8) {
            if cloud.isEmpty {
                Text("No hashtags yet.").font(.system(.footnote, design: .serif)).foregroundStyle(XITheme.line)
            } else {
                let counts = cloud.map(\.count)
                let lo = counts.min() ?? 1, hi = counts.max() ?? 1
                let shown = showAllTags ? cloud : Array(cloud.prefix(tagCap))
                // When expanded, a "hide" control sits ABOVE the cloud so you can
                // always collapse it back.
                if showAllTags && cloud.count > tagCap {
                    Button { withAnimation { showAllTags = false } } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "chevron.up").font(.system(size: 10, weight: .semibold))
                            Text("hide").font(.system(.footnote, design: .serif))
                        }.foregroundStyle(XITheme.gold)
                    }.buttonStyle(.plain)
                }
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
                if !showAllTags && cloud.count > tagCap {
                    Button { withAnimation { showAllTags = true } } label: {
                        HStack(spacing: 4) {
                            Text("show \(cloud.count - tagCap) more").font(.system(.footnote, design: .serif))
                            Image(systemName: "chevron.down").font(.system(size: 10, weight: .semibold))
                        }.foregroundStyle(XITheme.gold)
                    }.buttonStyle(.plain).padding(.top, 2)
                }
            }
        }
    }

    private func cloudSize(_ count: Int, _ lo: Int, _ hi: Int) -> CGFloat {
        guard hi > lo else { return 13 }
        return 11 + CGFloat(count - lo) / CGFloat(hi - lo) * 7
    }

    // MARK: Boolean search — always shown (short AND/OR boxes + small exclude)

    private var booleanSection: some View {
        VStack(alignment: .leading, spacing: 12) {
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
                    .foregroundStyle(.white)
                    .padding(.vertical, 6).padding(.horizontal, 11)
                    .background(XITheme.gold)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                }
                .buttonStyle(.plain)
                .disabled(store.advanced.isEmpty)
            }
        }
    }

    /// A wrapping row of short term boxes with the operator shown between them.
    private func termRow(_ title: String, op: String, terms: Binding<[String]>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            label(title)
            WrapLayout(spacing: 8) {
                ForEach(Array(terms.wrappedValue.indices), id: \.self) { i in
                    HStack(spacing: 8) {
                        if i > 0 {
                            Text(op.uppercased()).font(.system(size: 11, weight: .bold, design: .monospaced))
                                .foregroundStyle(XITheme.navInk)
                                .padding(.horizontal, 2)
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
