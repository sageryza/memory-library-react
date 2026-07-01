import SwiftUI

struct BookView: View {
    @ObservedObject var store: MiraclesStore
    @State private var distill = true

    private let columns = [GridItem(.flexible(), spacing: 16), GridItem(.flexible(), spacing: 16)]

    var body: some View {
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

            Spacer(minLength: 8)

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
        .padding(20)
        .frame(maxWidth: 560)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Theme.paper)
    }
}
