import SwiftUI
import ContactsUI
import MessageUI

/// The screen after "start a new game": one big person circle to start; + adds
/// another (up to four). Tapping a circle opens the contact picker, and picking
/// a contact IMMEDIATELY opens a pre-addressed Messages draft with that
/// person's own tracked invite link and an editable message — one pick, one
/// text, no separate "send" step (Sophie, Aug 2026: "I click on their contact.
/// Nothing happens… It should open up with a message screen that includes a
/// link and some sort of message like join my game or whatever that they can
/// edit"). The game is created on the first pick so the link exists to send.
/// Games are live from birth — no waiting room, no headcount, no lock.
struct VersusInviteView: View {
    var onCreated: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var slots: [InviteSlot] = [InviteSlot()]
    @State private var busy = false
    @State private var error: String?
    @State private var createdGameId: String?
    // The group-chat link still rides a SwiftUI sheet (UIActivityViewController
    // hosts fine there). The contact picker and the Messages composer do NOT —
    // see SystemPresenter below.
    @State private var shareLink: ShareItem?
    // The group-chat share ends the setup (you land in the game); the
    // can't-text fallback share doesn't, so more friends can still be added.
    @State private var finishAfterShare = false

    struct ShareItem: Identifiable { let link: String; var id: String { link } }

    struct InviteSlot: Identifiable, Equatable {
        let id = UUID()
        var name: String = ""
        var phone: String = ""
        /// The tracked seat's link token, set once the seat is registered on
        /// the game — re-tapping a filled circle re-opens their text with the
        /// SAME link, so a cancelled draft is two taps from resent.
        var token: String?
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

                Text("Tap a circle, pick a friend, and their invite text opens right there — their own link, ready to send. Tap a filled circle to resend.")
                    .font(.system(.footnote, design: .serif))
                    .foregroundStyle(XITheme.line)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)

                VStack(spacing: 12) {
                    Button { Task { await sendGroupChatLink() } } label: {
                        Text("Send it to the group chat!")
                            .font(.system(.body, design: .serif))
                            .frame(maxWidth: .infinity).padding(.vertical, 12)
                            .background(XITheme.white).foregroundStyle(XITheme.gold)
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                            .overlay(RoundedRectangle(cornerRadius: 6).stroke(XITheme.gold.opacity(0.5)))
                    }
                    .disabled(busy)

                    Button { Task { await goToGame() } } label: {
                        Text(busy ? "setting up…" : (createdGameId == nil ? "I'll start the game." : "Go to the game"))
                            .font(.system(.body, design: .serif))
                            .foregroundStyle(createdGameId == nil ? XITheme.line : XITheme.gold)
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
                    // Once invites are out the game is real — leaving the sheet
                    // lands in it (otherwise the lobby would never remember a
                    // game friends are already joining).
                    Button {
                        if createdGameId != nil { finish() } else { dismiss() }
                    } label: { Image(systemName: "xmark") }
                        .tint(XITheme.line).accessibilityLabel("Close")
                }
            }
        }
        .tint(XITheme.gold)
        .sheet(item: $shareLink, onDismiss: {
            // finish() only once the share sheet has fully gone — dismissing
            // two stacked sheets at once is the race that drops one.
            if finishAfterShare { finishAfterShare = false; finish() }
        }) { item in
            ActivitySheet(items: ["Build a memory board with me in XI: \(item.link)"]) {
                shareLink = nil
            }
        }
    }

    private func personCircle(_ slot: InviteSlot, index: Int) -> some View {
        VStack(spacing: 6) {
            Button { tapCircle(index) } label: {
                Image(systemName: slot.isFilled ? "person.fill" : "person")
                    .font(.system(size: 30))
                    .foregroundStyle(slot.isFilled ? .white : XITheme.gold)
                    .frame(width: 72, height: 72)
                    .background(slot.isFilled ? XITheme.gold : XITheme.white, in: Circle())
                    .overlay(Circle().stroke(slot.isFilled ? XITheme.gold : XITheme.line, lineWidth: 1))
            }
            .disabled(busy)
            Text(slot.isFilled ? slot.name : " ")
                .font(.system(size: 12, design: .serif))
                .foregroundStyle(XITheme.ink)
                .lineLimit(1)
                .frame(maxWidth: 84)
        }
    }

    // MARK: the one-tap flow — pick a contact, their text opens

    private static func token() -> String { XIService.randomShareId() }

    private func link(_ gameId: String, token: String?) -> String {
        var s = "https://incaseofamnesia.com/versus/\(gameId)"
        if let token { s += "?i=\(token)" }
        return s
    }

    private func tapCircle(_ i: Int) {
        error = nil
        if slots.indices.contains(i), slots[i].isFilled {
            // Re-send: same person, same link.
            Task { await inviteAndCompose(i) }
            return
        }
        SystemPresenter.shared.pickContact { name, phone in
            guard slots.indices.contains(i) else { return }
            slots[i].name = name
            slots[i].phone = phone
            Task { await inviteAndCompose(i) }
        }
    }

    /// Make sure the game and this person's tracked seat exist, then open
    /// their pre-addressed Messages draft. The Firestore round trips also give
    /// the picker's dismissal time to finish before the composer presents.
    private func inviteAndCompose(_ i: Int) async {
        busy = true
        do {
            let id = try await ensureGame()
            if slots[i].token == nil {
                let token = Self.token()
                try await VersusService.shared.addInvite(id, token: token, name: slots[i].name)
                slots[i].token = token
            }
            busy = false
            guard let token = slots[i].token else { return }
            let body = "Build a memory board with me in XI: \(link(id, token: token))"
            if SystemPresenter.canText() {
                SystemPresenter.shared.composeText(to: slots[i].phone, body: body) {}
            } else {
                // A device that can't text (no SIM, iPad) gets the share sheet
                // with the same tracked link instead of silently doing nothing.
                shareLink = ShareItem(link: link(id, token: token))
            }
        } catch { self.error = error.localizedDescription; busy = false }
    }

    private func ensureGame() async throws -> String {
        if let id = createdGameId { return id }
        let id = try await VersusService.shared.createGame()
        createdGameId = id
        return id
    }

    /// One shared link for the group chat — whoever taps it joins.
    private func sendGroupChatLink() async {
        busy = true; error = nil
        do {
            let id = try await ensureGame()
            busy = false
            finishAfterShare = true
            shareLink = ShareItem(link: link(id, token: nil))
        } catch { self.error = error.localizedDescription; busy = false }
    }

    private func goToGame() async {
        busy = true; error = nil
        do {
            _ = try await ensureGame()
            busy = false
            finish()
        } catch { self.error = error.localizedDescription; busy = false }
    }

    private func finish() {
        if let id = createdGameId {
            createdGameId = nil
            dismiss()
            onCreated(id)
        } else {
            dismiss()
        }
    }
}

// MARK: - System screens, presented the UIKit way

/// Presents the contact picker and the Messages composer with a plain UIKit
/// `present(_:)` from the top view controller. Both are REMOTE system view
/// controllers, and hosting them as the root of a SwiftUI sheet (inside
/// another sheet) is where the old flow died on device — tapping a contact
/// did nothing at all. Presented natively, their delegates behave.
@MainActor
final class SystemPresenter: NSObject, CNContactPickerDelegate, MFMessageComposeViewControllerDelegate {
    static let shared = SystemPresenter()
    private override init() {}

    private var onPick: ((String, String) -> Void)?
    private var onComposeDone: (() -> Void)?

    private var top: UIViewController? {
        let scene = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
            ?? UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        guard let root = scene?.windows.first(where: { $0.isKeyWindow })?.rootViewController
            ?? scene?.windows.first?.rootViewController else { return nil }
        var vc = root
        while let p = vc.presentedViewController, !p.isBeingDismissed { vc = p }
        return vc
    }

    /// Present once the previous modal has fully gone — presenting mid-
    /// dismissal is the race that silently drops system sheets. Retries a few
    /// times rather than presenting into a dying controller.
    private func presentWhenClear(_ vc: UIViewController, attempt: Int = 0) {
        guard let host = top else { return }
        if host.presentedViewController != nil || host.isBeingDismissed {
            guard attempt < 12 else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                self.presentWhenClear(vc, attempt: attempt + 1)
            }
            return
        }
        host.present(vc, animated: true)
    }

    // MARK: contact picker

    /// Apple's picker returns only the person the user taps — no contacts
    /// permission prompt is ever shown.
    func pickContact(onPick: @escaping (String, String) -> Void) {
        self.onPick = onPick
        let p = CNContactPickerViewController()
        p.delegate = self
        presentWhenClear(p)
    }

    func contactPicker(_ picker: CNContactPickerViewController, didSelect contact: CNContact) {
        let name = [contact.givenName, contact.familyName]
            .filter { !$0.isEmpty }.joined(separator: " ")
        let phone = contact.phoneNumbers.first?.value.stringValue ?? ""
        let cb = onPick; onPick = nil
        cb?(name.isEmpty ? "Friend" : name, phone)
    }

    func contactPickerDidCancel(_ picker: CNContactPickerViewController) { onPick = nil }

    // MARK: messages composer

    static func canText() -> Bool { MFMessageComposeViewController.canSendText() }

    /// A pre-addressed, pre-filled Messages draft — the words are editable and
    /// the user taps Send (Apple requires that tap; the app can't text
    /// silently).
    func composeText(to recipient: String, body: String, onDone: @escaping () -> Void) {
        guard Self.canText() else { onDone(); return }
        self.onComposeDone = onDone
        let mc = MFMessageComposeViewController()
        mc.messageComposeDelegate = self
        if !recipient.isEmpty { mc.recipients = [recipient] }
        mc.body = body
        presentWhenClear(mc)
    }

    func messageComposeViewController(_ controller: MFMessageComposeViewController,
                                      didFinishWith result: MessageComposeResult) {
        controller.dismiss(animated: true)
        let cb = onComposeDone; onComposeDone = nil
        cb?()
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
