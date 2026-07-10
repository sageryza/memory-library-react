import SwiftUI
import ContactsUI
import MessageUI

/// The screen after "start a new game": set up who's playing BEFORE the game
/// exists. One big person circle to start; + adds another (up to four). Fill a
/// circle from your contacts to send them their own tracked invite text, or
/// leave circles blank and use the group-chat link (untracked), or just start
/// the game and share however you like. Either way the game sits in its
/// waiting room and begins for everyone at once when the last player joins.
struct VersusInviteView: View {
    var onCreated: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var slots: [InviteSlot] = [InviteSlot()]
    @State private var pickingIndex: Int?
    @State private var busy = false
    @State private var error: String?
    // The per-person text queue: after the game is created, each picked contact
    // gets their own pre-addressed Messages sheet with their unique link.
    @State private var sendQueue: [(recipient: String, body: String)] = []
    @State private var composing: (recipient: String, body: String)?
    @State private var createdGameId: String?
    @State private var groupShareLink: String?

    struct InviteSlot: Identifiable, Equatable {
        let id = UUID()
        var name: String = ""
        var phone: String = ""
        var isFilled: Bool { !name.isEmpty }
    }

    private static let maxFriends = 4

    var body: some View {
        NavigationStack {
            VStack(spacing: 26) {
                Text("Who's playing?")
                    .font(.system(.title3, design: .serif))
                    .foregroundStyle(XITheme.ink)
                    .padding(.top, 18)

                // The person circles — one per friend, + adds another.
                HStack(spacing: 14) {
                    ForEach(Array(slots.enumerated()), id: \.element.id) { i, slot in
                        personCircle(slot, index: i)
                    }
                    if slots.count < Self.maxFriends {
                        Button {
                            slots.append(InviteSlot())
                        } label: {
                            Image(systemName: "plus")
                                .font(.system(size: 18, weight: .medium))
                                .foregroundStyle(XITheme.gold)
                                .frame(width: 34, height: 34)
                                .background(XITheme.white, in: Circle())
                                .overlay(Circle().stroke(XITheme.line, lineWidth: 0.5))
                        }
                        .accessibilityLabel("Add another friend")
                    }
                }

                Text("Tap a circle to pick from your contacts — each friend gets their own invite, and you'll see exactly who's joined.")
                    .font(.system(.footnote, design: .serif))
                    .foregroundStyle(XITheme.line)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)

                VStack(spacing: 12) {
                    if slots.contains(where: { $0.isFilled }) {
                        Button { Task { await sendPersonalInvites() } } label: {
                            Text(busy ? "setting up…" : "send the invites")
                                .font(.system(.body, design: .serif))
                                .frame(maxWidth: .infinity).padding(.vertical, 12)
                                .background(XITheme.gold).foregroundStyle(.white)
                                .clipShape(RoundedRectangle(cornerRadius: 6))
                        }
                        .disabled(busy)
                    }

                    Button { Task { await sendGroupChatLink() } } label: {
                        Text("Send it to the group chat!")
                            .font(.system(.body, design: .serif))
                            .frame(maxWidth: .infinity).padding(.vertical, 12)
                            .background(XITheme.white).foregroundStyle(XITheme.gold)
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                            .overlay(RoundedRectangle(cornerRadius: 6).stroke(XITheme.gold.opacity(0.5)))
                    }
                    .disabled(busy)

                    Button { Task { await startPlain() } } label: {
                        Text("I'll start the game.")
                            .font(.system(.body, design: .serif))
                            .foregroundStyle(XITheme.line)
                    }
                    .disabled(busy)
                }
                .padding(.horizontal, 24)

                if let error { Text(error).font(.footnote).foregroundStyle(.red).multilineTextAlignment(.center) }
                Spacer()
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .background(XITheme.paper.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text("invite your friends")
                        .font(.system(.headline, design: .serif)).foregroundStyle(XITheme.ink)
                }
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }
                        .tint(XITheme.line).accessibilityLabel("Cancel")
                }
            }
        }
        .tint(XITheme.gold)
        .sheet(isPresented: Binding(get: { pickingIndex != nil }, set: { if !$0 { pickingIndex = nil } })) {
            ContactPicker { name, phone in
                if let i = pickingIndex, slots.indices.contains(i) {
                    slots[i].name = name
                    slots[i].phone = phone
                }
                pickingIndex = nil
            }
        }
        .sheet(isPresented: Binding(get: { composing != nil }, set: { if !$0 { advanceQueue() } })) {
            if let c = composing {
                MessageComposer(recipient: c.recipient, body: c.body) { advanceQueue() }
            }
        }
        .sheet(isPresented: Binding(get: { groupShareLink != nil }, set: { if !$0 { finish() } })) {
            if let link = groupShareLink {
                ActivitySheet(items: ["Build a memory board with me in XI: \(link)"]) { finish() }
            }
        }
    }

    private func personCircle(_ slot: InviteSlot, index: Int) -> some View {
        VStack(spacing: 6) {
            Button { pickingIndex = index } label: {
                Image(systemName: slot.isFilled ? "person.fill" : "person")
                    .font(.system(size: 30))
                    .foregroundStyle(slot.isFilled ? .white : XITheme.gold)
                    .frame(width: 72, height: 72)
                    .background(slot.isFilled ? XITheme.gold : XITheme.white, in: Circle())
                    .overlay(Circle().stroke(slot.isFilled ? XITheme.gold : XITheme.line, lineWidth: 1))
            }
            Text(slot.isFilled ? slot.name : " ")
                .font(.system(size: 12, design: .serif))
                .foregroundStyle(XITheme.ink)
                .lineLimit(1)
                .frame(maxWidth: 84)
        }
    }

    // MARK: create + send

    private static func token() -> String { XIService.randomShareId() }

    private func link(_ gameId: String, token: String?) -> String {
        var s = "https://incaseofamnesia.com/versus/\(gameId)"
        if let token { s += "?i=\(token)" }
        return s
    }

    /// Each friend gets a unique tracked link; the game knows who accepted.
    private func sendPersonalInvites() async {
        busy = true; error = nil
        do {
            let invites = slots.map { (token: Self.token(), name: $0.name) }
            let id = try await VersusService.shared.createGame(
                expectedPlayers: slots.count + 1, invites: invites)
            createdGameId = id
            // Queue a pre-addressed text per picked contact, each with their
            // own link. (Apple requires a Send tap per message — the app can't
            // text silently.)
            sendQueue = zip(slots, invites).compactMap { slot, inv in
                guard slot.isFilled else { return nil }
                return (recipient: slot.phone,
                        body: "Build a memory board with me in XI: \(link(id, token: inv.token))")
            }
            busy = false
            advanceQueue()
        } catch { self.error = error.localizedDescription; busy = false }
    }

    /// One shared link for the group chat — counts seats, doesn't track names.
    private func sendGroupChatLink() async {
        busy = true; error = nil
        do {
            let id = try await VersusService.shared.createGame(expectedPlayers: slots.count + 1)
            createdGameId = id
            busy = false
            groupShareLink = link(id, token: nil)
        } catch { self.error = error.localizedDescription; busy = false }
    }

    /// No invites now — straight to the waiting room; share from there.
    private func startPlain() async {
        busy = true; error = nil
        do {
            let id = try await VersusService.shared.createGame(expectedPlayers: slots.count + 1)
            createdGameId = id
            busy = false
            finish()
        } catch { self.error = error.localizedDescription; busy = false }
    }

    private func advanceQueue() {
        if sendQueue.isEmpty {
            composing = nil
            if createdGameId != nil { finish() }
        } else {
            composing = sendQueue.removeFirst()
        }
    }

    private func finish() {
        groupShareLink = nil
        if let id = createdGameId {
            createdGameId = nil
            dismiss()
            onCreated(id)
        }
    }
}

// MARK: - UIKit bridges

/// Apple's contact picker — returns only the person the user taps, so no
/// contacts permission prompt is ever shown.
private struct ContactPicker: UIViewControllerRepresentable {
    var onPick: (String, String) -> Void

    func makeUIViewController(context: Context) -> CNContactPickerViewController {
        let p = CNContactPickerViewController()
        p.delegate = context.coordinator
        return p
    }
    func updateUIViewController(_ vc: CNContactPickerViewController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(onPick: onPick) }

    final class Coordinator: NSObject, CNContactPickerDelegate {
        let onPick: (String, String) -> Void
        init(onPick: @escaping (String, String) -> Void) { self.onPick = onPick }
        func contactPicker(_ picker: CNContactPickerViewController, didSelect contact: CNContact) {
            let name = [contact.givenName, contact.familyName]
                .filter { !$0.isEmpty }.joined(separator: " ")
            let phone = contact.phoneNumbers.first?.value.stringValue ?? ""
            onPick(name.isEmpty ? "Friend" : name, phone)
        }
        func contactPickerDidCancel(_ picker: CNContactPickerViewController) {}
    }
}

/// A pre-addressed, pre-filled Messages sheet — the user taps Send.
private struct MessageComposer: UIViewControllerRepresentable {
    let recipient: String
    let body: String
    var onDone: () -> Void

    static func canSend() -> Bool { MFMessageComposeViewController.canSendText() }

    func makeUIViewController(context: Context) -> UIViewController {
        guard MFMessageComposeViewController.canSendText() else {
            let vc = UIViewController()
            DispatchQueue.main.async { onDone() }
            return vc
        }
        let mc = MFMessageComposeViewController()
        mc.messageComposeDelegate = context.coordinator
        if !recipient.isEmpty { mc.recipients = [recipient] }
        mc.body = body
        return mc
    }
    func updateUIViewController(_ vc: UIViewController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(onDone: onDone) }

    final class Coordinator: NSObject, MFMessageComposeViewControllerDelegate {
        let onDone: () -> Void
        init(onDone: @escaping () -> Void) { self.onDone = onDone }
        func messageComposeViewController(_ controller: MFMessageComposeViewController,
                                          didFinishWith result: MessageComposeResult) {
            controller.dismiss(animated: true)
            onDone()
        }
    }
}

/// The system share sheet, for the group-chat link.
private struct ActivitySheet: UIViewControllerRepresentable {
    let items: [Any]
    var onDone: () -> Void

    func makeUIViewController(context: Context) -> UIActivityViewController {
        let vc = UIActivityViewController(activityItems: items, applicationActivities: nil)
        vc.completionWithItemsHandler = { _, _, _, _ in onDone() }
        return vc
    }
    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}
}
