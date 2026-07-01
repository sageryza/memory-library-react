import SwiftUI

struct BookView: View {
    @ObservedObject var store: MiraclesStore
    @State private var distill = true

    private let columns = [GridItem(.flexible(), spacing: 16), GridItem(.flexible(), spacing: 16)]

    var body: some View {
        ZStack {
            Theme.paper.ignoresSafeArea() // cream all around

            VStack(spacing: 14) {
                // The current page: a white sheet on the cream, with a thin
                // sliver of the page behind peeking out on the side(s) that have
                // more pages — so you can feel where you are in the book.
                pageContent
                    .background { pageSheet }
                    .background { if store.index < store.pages.count - 1 { pageSheet.offset(x: 8) } }
                    .background { if store.index > 0 { pageSheet.offset(x: -8) } }
                    .padding(.horizontal, 22)

                nav
                    .padding(.horizontal, 26)
            }
            .frame(maxWidth: 540)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .padding(.top, 14)
        }
    }

    // A single page: white sheet with a faint edge and soft shadow.
    private var pageSheet: some View {
        RoundedRectangle(cornerRadius: 5)
            .fill(Color.white)
            .overlay(RoundedRectangle(cornerRadius: 5).stroke(Theme.line.opacity(0.5), lineWidth: 1))
            .shadow(color: .black.opacity(0.06), radius: 6, x: 0, y: 3)
    }

    private var pageContent: some View {
        VStack(spacing: 16) {
            // Date — right-aligned, like the physical book: a printed "DATE:"
            // label (no line under it) then the handwritten date, with the
            // underline only beneath the handwritten date.
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Spacer()
                Text("DATE:")
                    .font(.custom(Theme.serif, size: 15))
                    .tracking(1)
                    .foregroundStyle(Theme.muted)
                Text(store.page.date, format: .dateTime.month(.wide).day())
                    .font(.custom(Theme.handwriting, size: 27))
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

    private var nav: some View {
        HStack {
            Button("‹ back") { store.turnBack() }
                .disabled(store.index == 0)
            Spacer()
            Text("\(store.index + 1) / \(store.pages.count)")
                .font(.custom(Theme.serif, size: 15)).foregroundStyle(Theme.muted)
            Spacer()
            Button("turn page ›") { store.turnForward() }
                .disabled(!store.canTurnForward)
        }
        .font(.custom(Theme.serif, size: 18))
        .tint(Theme.serifInk)
    }
}
