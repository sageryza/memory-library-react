import SwiftUI

/// Warm, notebook-y palette + hand-drawn outline weights, so the screen reads as
/// a journal rather than a dashboard.
enum TowerStyle {
    static let paper    = Color(red: 0.960, green: 0.945, blue: 0.900) // warm cream ground
    static let card     = Color(red: 0.988, green: 0.980, blue: 0.962) // near-white, warm
    static let ink      = Color(red: 0.20,  green: 0.17,  blue: 0.13)  // soft near-black
    static let penGray  = Color(red: 0.52,  green: 0.50,  blue: 0.46)  // gray hand-drawn outline
}

/// The Towers screen: a grid of idea-tiles. Tap one to open that idea's
/// trajectory — every time it was defined, redefined, or used across the
/// journals. The bottom-nav icon for this screen is the custom turret.
struct TowersView: View {
    private let columns = [GridItem(.flexible(), spacing: 12),
                           GridItem(.flexible(), spacing: 12),
                           GridItem(.flexible(), spacing: 12)]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Towers")
                        .font(.largeTitle.weight(.semibold))
                        .foregroundStyle(TowerStyle.ink)
                    Text("Ideas, traced as they evolved.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 20)
                .padding(.top, 12)
                .padding(.bottom, 18)

                LazyVGrid(columns: columns, spacing: 12) {
                    ForEach(TowersData.all) { tower in
                        NavigationLink { TowerDetailView(tower: tower) } label: {
                            TowerTile(tower: tower)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 40)
            }
            .background(TowerStyle.paper.ignoresSafeArea())
        }
        // The screen commits to a light paper look with hardcoded light cards,
        // so pin light-mode color resolution — otherwise .primary/.secondary
        // text flips to white in dark mode and vanishes on the light cards.
        .environment(\.colorScheme, .light)
    }
}

/// One idea on the grid — icon chip + name + how many stops on its trajectory.
private struct TowerTile: View {
    let tower: Tower

    var body: some View {
        VStack(spacing: 9) {
            ZStack {
                SketchRoundedRect(cornerRadius: 16, seed: sketchSeed(tower.name + "chip"), wobble: 1.3)
                    .fill(tower.tint.opacity(0.14))
                SketchRoundedRect(cornerRadius: 16, seed: sketchSeed(tower.name + "chip"), wobble: 1.3)
                    .stroke(tower.tint.opacity(0.5), style: .init(lineWidth: 1.4, lineCap: .round, lineJoin: .round))
                Image(systemName: tower.symbol)
                    .font(.system(size: 26, weight: .semibold))
                    .foregroundStyle(tower.tint)
            }
            .frame(height: 74)

            Text(tower.name)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(TowerStyle.ink)
                .lineLimit(1).minimumScaleFactor(0.8)
            Text("\(tower.trajectory.count) stops")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 8)
        .frame(maxWidth: .infinity)
        .background(
            ZStack {
                SketchRoundedRect(cornerRadius: 18, seed: sketchSeed(tower.name), wobble: 1.8)
                    .fill(TowerStyle.card)
                SketchRoundedRect(cornerRadius: 18, seed: sketchSeed(tower.name), wobble: 1.8)
                    .stroke(TowerStyle.penGray.opacity(0.7), style: .init(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
            }
        )
    }
}

/// One idea's full trajectory, with a segmented tab when the tower has Examples.
struct TowerDetailView: View {
    let tower: Tower
    @State private var tab: TowerTab = .trajectory

    private var entries: [TowerEntry] {
        tab == .all ? tower.allMentions : tower.trajectory
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header

                if tower.tabs.count > 1 {
                    Picker("View", selection: $tab) {
                        ForEach(tower.tabs) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal, 20)
                }

                VStack(spacing: 0) {
                    ForEach(Array(entries.enumerated()), id: \.element.id) { idx, entry in
                        TowerStationRow(entry: entry,
                                        tint: tower.tint,
                                        isFirst: idx == 0,
                                        isLast: idx == entries.count - 1)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 40)
            }
        }
        .background(Color(white: 0.98).ignoresSafeArea())
        .environment(\.colorScheme, .light)   // light paper look — keep text dark in dark mode too
        .navigationTitle(tower.name)
        .navigationBarTitleDisplayMode(.inline)
    }

    private var header: some View {
        HStack(spacing: 14) {
            ZStack {
                SketchRoundedRect(cornerRadius: 16, seed: sketchSeed(tower.name + "hdr"), wobble: 1.3)
                    .fill(tower.tint.opacity(0.14))
                SketchRoundedRect(cornerRadius: 16, seed: sketchSeed(tower.name + "hdr"), wobble: 1.3)
                    .stroke(tower.tint.opacity(0.5), style: .init(lineWidth: 1.4, lineCap: .round, lineJoin: .round))
                Image(systemName: tower.symbol)
                    .font(.system(size: 24, weight: .semibold))
                    .foregroundStyle(tower.tint)
            }
            .frame(width: 56, height: 56)
            Text(tower.blurb)
                .font(.callout)
                .foregroundStyle(.secondary)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
    }
}

/// A single stop on the trajectory, drawn as a station on a vertical line — the
/// tower rising. Placeholder entries (not yet transcribed) render dimmed.
private struct TowerStationRow: View {
    let entry: TowerEntry
    let tint: Color
    let isFirst: Bool
    let isLast: Bool
    @EnvironmentObject private var router: AppRouter

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            // The rail + node
            VStack(spacing: 0) {
                Rectangle()
                    .fill(isFirst ? Color.clear : railColor)
                    .frame(width: 2, height: 10)
                Circle()
                    .fill(entry.inCorpus ? entry.kind.tint : Color(white: 0.75))
                    .frame(width: 11, height: 11)
                    .overlay(Circle().stroke(Color(white: 0.98), lineWidth: 2))
                Rectangle()
                    .fill(isLast ? Color.clear : railColor)
                    .frame(width: 2)
                    .frame(maxHeight: .infinity)
            }
            .frame(width: 12)

            card
                .padding(.bottom, 12)
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    private var railColor: Color { tint.opacity(0.25) }

    private var card: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(entry.kind.label.uppercased())
                    .font(.system(size: 10, weight: .bold))
                    .tracking(0.5)
                    .foregroundStyle(entry.inCorpus ? entry.kind.tint : Color(white: 0.6))
                Spacer()
                if let page = entry.page, entry.inCorpus {
                    // Tap the page reference to open that journal page in context.
                    Button {
                        router.openTimeline(page: page)
                    } label: {
                        HStack(spacing: 3) {
                            Text(metaLabel ?? "p\(page)")
                            Image(systemName: "arrow.up.forward")
                                .font(.system(size: 9, weight: .semibold))
                        }
                        .font(.caption2)
                        .foregroundStyle(tint)
                    }
                    .buttonStyle(.plain)
                } else if let meta = metaLabel {
                    Text(meta)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }

            Text("“\(entry.quote)”")
                .font(.callout)
                .foregroundStyle(entry.inCorpus ? .primary : .secondary)
                .fixedSize(horizontal: false, vertical: true)

            if let note = entry.note {
                Text(note)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if !entry.inCorpus {
                Text("Not transcribed yet")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(Color(white: 0.6))
                    .padding(.horizontal, 7).padding(.vertical, 3)
                    .background(RoundedRectangle(cornerRadius: 6, style: .continuous).fill(Color(white: 0.92)))
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            ZStack {
                SketchRoundedRect(cornerRadius: 14, seed: sketchSeed(entry.quote), wobble: 1.6)
                    .fill(TowerStyle.card)
                SketchRoundedRect(cornerRadius: 14, seed: sketchSeed(entry.quote), wobble: 1.6)
                    .stroke(TowerStyle.penGray.opacity(entry.inCorpus ? 0.6 : 0.4),
                            style: .init(lineWidth: 1.4, lineCap: .round, lineJoin: .round))
            }
        )
        .opacity(entry.inCorpus ? 1 : 0.85)
    }

    private var metaLabel: String? {
        switch (entry.date, entry.page) {
        case let (d?, p?): return "\(d) · p\(p)"
        case let (d?, nil): return d
        case let (nil, p?): return "p\(p)"
        default: return nil
        }
    }
}
