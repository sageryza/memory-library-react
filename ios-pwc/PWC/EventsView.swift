import SwiftUI

struct EventsView: View {
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    ForEach(Mock.events) { e in EventCard(event: e) }
                    Text("Watching is better together. More meetups soon.")
                        .font(PWC.mono(11)).foregroundStyle(PWC.sage)
                        .padding(.top, 6)
                }
                .padding(16)
                .frame(maxWidth: 560)
                .frame(maxWidth: .infinity)
            }
            .background(PWC.paper.ignoresSafeArea())
            .navigationTitle("Events")
        }
    }
}

struct EventCard: View {
    let event: PWCEvent
    @State private var going = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                VStack(spacing: 0) {
                    Text(event.day.uppercased()).font(PWC.mono(11, .bold)).foregroundStyle(PWC.accent)
                }
                Text(event.title).font(PWC.display(18, .semibold)).foregroundStyle(PWC.ink)
                Spacer()
            }
            Label("\(event.place) · \(event.neighborhood)", systemImage: "mappin")
                .font(PWC.mono(12)).foregroundStyle(PWC.sage)
            Text(event.date).font(PWC.mono(12)).foregroundStyle(PWC.dim)
            HStack {
                Text("\(event.going + (going ? 1 : 0)) going").font(PWC.mono(12)).foregroundStyle(PWC.ink)
                Spacer()
                Button { going.toggle() } label: {
                    Text(going ? "Going ✓" : "I'll watch")
                        .font(PWC.display(15, .semibold))
                        .padding(.vertical, 8).padding(.horizontal, 16)
                        .background(going ? PWC.sage : PWC.accent)
                        .foregroundStyle(PWC.onAccent)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PWC.card)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(PWC.line, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
