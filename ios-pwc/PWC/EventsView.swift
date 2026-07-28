import SwiftUI

struct EventsView: View {
    @EnvironmentObject private var events: EventsStore
    @EnvironmentObject private var identity: Identity

    @State private var rsvping: PWCEvent?
    @State private var failure: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    PWCMasthead(title: "Meetups", subtitle: "Watching is better together")
                    ForEach(events.events) { e in
                        EventCard(event: e,
                                  going: events.hasRSVPd(e),
                                  onRSVP: { rsvping = e })
                    }
                    Text(events.usingSamples
                         ? "Sample gatherings — post a real one on the website and it shows up here."
                         : "More gatherings soon.")
                        .font(.custom("CormorantGaramond-Italic", size: 15))
                        .foregroundStyle(PWC.sage)
                        .multilineTextAlignment(.center)
                        .padding(.top, 8)
                }
                .padding(16)
                .frame(maxWidth: 560)
                .frame(maxWidth: .infinity)
            }
            .refreshable { await events.refresh() }
            .background(PWC.paper.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.hidden, for: .navigationBar)
            .task { await events.refresh() }
            .sheet(item: $rsvping) { event in
                RSVPSheet(event: event, email: identity.email) { email in
                    identity.email = email
                    do {
                        try await events.rsvp(to: event, email: email)
                        rsvping = nil
                    } catch {
                        rsvping = nil
                        failure = error.localizedDescription
                    }
                } onCancel: {
                    rsvping = nil
                }
            }
            .alert("Couldn't send that RSVP",
                   isPresented: Binding(get: { failure != nil }, set: { if !$0 { failure = nil } })) {
                Button("OK", role: .cancel) { failure = nil }
            } message: {
                Text(failure ?? "")
            }
        }
    }
}

struct EventCard: View {
    let event: PWCEvent
    let going: Bool
    var onRSVP: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 16) {
                dateBlock
                VStack(alignment: .leading, spacing: 6) {
                    Text(event.title)
                        .font(PWC.display(21, .medium)).foregroundStyle(PWC.cardInk)
                        .fixedSize(horizontal: false, vertical: true)
                    Label([event.place, event.neighborhood].filter { !$0.isEmpty }.joined(separator: " · "),
                          systemImage: "mappin")
                        .font(PWC.mono(11)).foregroundStyle(PWC.cardSub)
                    if !event.timeText.isEmpty {
                        Text(event.timeText).font(PWC.mono(11)).tracking(1).foregroundStyle(PWC.cardSub)
                    }
                }
                Spacer(minLength: 0)
            }
            if !event.details.isEmpty {
                Text(event.details)
                    .font(PWC.display(16, .regular)).foregroundStyle(PWC.cardInk)
                    .lineSpacing(2).fixedSize(horizontal: false, vertical: true)
            }
            HStack {
                Text(going ? "YOU'RE GOING" : (event.isPrivate ? "MEMBERS ONLY" : "OPEN TO ALL"))
                    .font(PWC.mono(10)).tracking(1.5).foregroundStyle(PWC.cardSub)
                Spacer()
                Button { onRSVP() } label: {
                    Text(going ? "Going ✓" : "I'll watch")
                        .font(PWC.display(15, .semibold))
                        .foregroundStyle(going ? PWC.onAccent : PWC.accent)
                        .padding(.vertical, 8).padding(.horizontal, 18)
                        .background(going ? PWC.accent : Color.clear)
                        .overlay(RoundedRectangle(cornerRadius: 6).stroke(PWC.accent, lineWidth: 1))
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                }
                .buttonStyle(.plain)
                .disabled(going)
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
            Text(event.weekday.uppercased()).font(PWC.mono(10, .semibold)).tracking(1).foregroundStyle(PWC.accent)
            Text(event.dayNumber).font(PWC.display(28, .medium)).foregroundStyle(PWC.cardInk)
            Text(event.monthAbbrev.uppercased()).font(PWC.mono(9)).tracking(1).foregroundStyle(PWC.cardSub)
        }
        .frame(width: 46)
        .padding(.top, 2)
    }
}

/// Collects the email the RSVP is sent under. The club emails these on, so an
/// address is the whole point of the record.
struct RSVPSheet: View {
    let event: PWCEvent
    @State var email: String
    var onSubmit: @MainActor (String) async -> Void
    var onCancel: () -> Void

    @State private var sending = false

    private var valid: Bool {
        let trimmed = email.trimmingCharacters(in: .whitespaces)
        return trimmed.contains("@") && trimmed.count > 3
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text(event.title)
                        .font(PWC.display(22, .semibold)).foregroundStyle(PWC.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("We like to know who's coming.")
                        .font(PWC.mono(12)).foregroundStyle(PWC.sage)

                    HStack(spacing: 10) {
                        Image(systemName: "envelope").foregroundStyle(PWC.sage).frame(width: 18)
                        TextField("you@example.com", text: $email)
                            .font(PWC.mono(14)).foregroundStyle(PWC.ink)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.emailAddress)
                            .autocorrectionDisabled()
                    }
                    .padding(12)
                    .background(PWC.card)
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(PWC.line))

                    Spacer(minLength: 0)
                }
                .padding(20)
                .frame(maxWidth: 560)
                .frame(maxWidth: .infinity)
            }
            .background(PWC.paper.ignoresSafeArea())
            .navigationTitle("RSVP")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { onCancel() }.tint(PWC.dim)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    if sending {
                        ProgressView().tint(PWC.accent)
                    } else {
                        Button("Send") {
                            sending = true
                            Task {
                                await onSubmit(email.trimmingCharacters(in: .whitespaces))
                                sending = false
                            }
                        }
                        .font(.body.weight(.semibold)).tint(PWC.accent).disabled(!valid)
                    }
                }
            }
        }
    }
}
