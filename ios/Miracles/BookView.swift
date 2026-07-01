import SwiftUI

struct BookView: View {
    @ObservedObject var store: MiraclesStore
    @State private var distill = true

    private let columns = [GridItem(.flexible(), spacing: 16), GridItem(.flexible(), spacing: 16)]
    private let pageMargin: CGFloat = 22
    private var neighborShift: CGFloat { pageMargin + 16 } // enough to bleed off-screen

    var body: some View {
        ZStack {
            Theme.paper.ignoresSafeArea() // cream all around

            // The current page, centered — with a neighbor page bleeding off the
            // screen edge on the side(s) that have more pages, so it reads like a
            // real book with more just out of view.
            pageContent
                .background { pageSheet }
                .background { if store.canTurnForward { pageSheet.offset(x: neighborShift) } }
                .background { if store.index > 0 { pageSheet.offset(x: -neighborShift) } }
                .frame(maxWidth: 560)
                .padding(.horizontal, pageMargin)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)

            // Faint turn arrows on either side (replaces the old nav row).
            HStack {
                turnArrow("arrowtriangle.backward.fill", enabled: store.index > 0) { store.turnBack() }
                Spacer()
                turnArrow("arrowtriangle.forward.fill", enabled: store.canTurnForward) { store.turnForward() }
            }
            .padding(.horizontal, 4)
        }
    }

    // A single page: white sheet with a faint edge and soft shadow.
    private var pageSheet: some View {
        RoundedRectangle(cornerRadius: 5)
            .fill(Color.white)
            .overlay(RoundedRectangle(cornerRadius: 5).stroke(Theme.line.opacity(0.6), lineWidth: 1))
            .shadow(color: .black.opacity(0.06), radius: 6, x: 0, y: 3)
    }

    private var pageContent: some View {
        VStack(spacing: 16) {
            // Date — right-aligned, like the physical book: a printed "DATE:"
            // label (no line under it) then the handwritten date, with the
            // underline only beneath the handwritten date.
            HStack(alignment: .firstTextBaseline, spacing: 5) {
                Spacer()
                Text("DATE:")
                    .font(.custom(Theme.serif, size: 12))
                    .tracking(1)
                    .foregroundStyle(Theme.muted)
                Text(store.page.date, format: .dateTime.month(.wide).day())
                    .font(.custom(Theme.handwriting, size: 22))
                    .foregroundStyle(Theme.dateInk)
                    .padding(.bottom, 2)
                    .overlay(Rectangle().frame(height: 1).foregroundStyle(Theme.dateUnderline), alignment: .bottom)
            }

            LazyVGrid(columns: columns, spacing: 18) {
                ForEach(store.page.boxes) { box in
                    BoxView(store: store, box: box, distill: $distill)
                }
            }
        }
        .padding(20)
    }

    // Faint filled triangle to turn a page; invisible + inert at the ends.
    private func turnArrow(_ symbol: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 22))
                .foregroundStyle(Theme.muted.opacity(enabled ? 0.45 : 0))
                .frame(width: 30, height: 64)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .allowsHitTesting(enabled)
    }
}
