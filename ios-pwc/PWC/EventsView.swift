import SwiftUI

struct EventsView: View {
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    PWCMasthead(title: "Meetups", subtitle: "Watching is better together")
                    ForEach(Mock.events) { e in EventCard(event: e) }
                    Text("More gatherings soon.")
                        .font(.custom("CormorantGaramond-Italic", size: 15))
                        .foregroundStyle(PWC.sage)
                        .padding(.top, 8)
                }
                .padding(16)
                .frame(maxWidth: 560)
                .frame(maxWidth: .infinity)
            }
            .background(PWC.paper.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.hidden, for: .navigationBar)
        }
    }
}

struct EventCard: View {
    let event: PWCEvent
    @State private var going = false

    private var parts: (month: String, num: String, time: String) {
        let comps = event.date.split(separator: "·")
        let left = comps.first.map { $0.trimmingCharacters(in: .whitespaces) } ?? ""
        let time = comps.count > 1 ? comps[1].trimmingCharacters(in: .whitespaces) : ""
        let mn = left.split(separator: " ")
        return (mn.first.map(String.init) ?? "", mn.count > 1 ? String(mn[1]) : "", time)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 16) {
                dateBlock
                VStack(alignment: .leading, spacing: 6) {
                    Text(event.title)
                        .font(PWC.display(21, .medium)).foregroundStyle(PWC.cardInk)
                        .fixedSize(horizontal: false, vertical: true)
                    Label("\(event.place) · \(event.neighborhood)", systemImage: "mappin")
                        .font(PWC.mono(11)).foregroundStyle(PWC.cardSub)
                    Text(parts.time).font(PWC.mono(11)).tracking(1).foregroundStyle(PWC.cardSub)
                }
                Spacer(minLength: 0)
            }
            HStack {
                Text("\(event.going + (going ? 1 : 0)) WATCHING")
                    .font(PWC.mono(10)).tracking(1.5).foregroundStyle(PWC.cardSub)
                Spacer()
                Button { going.toggle() } label: {
                    Text(going ? "Going ✓" : "I'll watch")
                        .font(PWC.display(15, .semibold))
                        .foregroundStyle(going ? PWC.onAccent : PWC.accent)
                        .padding(.vertical, 8).padding(.horizontal, 18)
                        .background(going ? PWC.accent : Color.clear)
                        .overlay(RoundedRectangle(cornerRadius: 6).stroke(PWC.accent, lineWidth: 1))
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PWC.cardBg)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(PWC.cardLine, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var dateBlock: some View {
        VStack(spacing: 1) {
            Text(event.day.uppercased()).font(PWC.mono(10, .semibold)).tracking(1).foregroundStyle(PWC.accent)
            Text(parts.num).font(PWC.display(28, .medium)).foregroundStyle(PWC.cardInk)
            Text(parts.month.uppercased()).font(PWC.mono(9)).tracking(1).foregroundStyle(PWC.cardSub)
        }
        .frame(width: 46)
        .padding(.top, 2)
    }
}
