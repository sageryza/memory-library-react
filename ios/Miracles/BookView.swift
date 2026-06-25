import SwiftUI

struct BookView: View {
    @ObservedObject var store: MiraclesStore
    @State private var distill = true

    private let columns = [GridItem(.flexible(), spacing: 16), GridItem(.flexible(), spacing: 16)]

    var body: some View {
        VStack(spacing: 16) {
            // Date — right-aligned, underline only as wide as the date.
            HStack {
                Spacer()
                Text(store.page.date, format: .dateTime.month(.wide).day())
                    .font(.custom(Theme.handwriting, size: 24))
                    .foregroundStyle(Theme.ink.opacity(0.8))
                    .padding(.bottom, 2)
                    .overlay(Rectangle().frame(height: 1).foregroundStyle(Theme.line), alignment: .bottom)
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
                    .font(.footnote).foregroundStyle(Theme.muted)
                Spacer()
                Button("turn page ›") { store.turnForward() }
                    .disabled(!store.canTurnForward)
            }
            .font(.system(.body, design: .serif))
            .tint(Color(red: 0.54, green: 0.43, blue: 0.23))
        }
        .padding(20)
        .frame(maxWidth: 560)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Theme.paper)
    }
}
