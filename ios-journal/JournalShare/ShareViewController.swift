import UIKit
import UniformTypeIdentifiers

/// "Send to JournalReader" — the share-sheet way onto the journal shelf.
///
/// Share a scanned journal PDF from Genius Scan, Files, Mail, anywhere, and it
/// lands in the private journal-scans cloud folder (the same shelf the app's
/// own "Send journals to Claude" picker fills), with the manifest index
/// updated server-side so the extraction pipeline sees it immediately.
///
/// Uploads run through a BACKGROUND URLSession (house rule — nothing waits in
/// the foreground): files are staged in the App Group container, one upload
/// task each is handed to the system's transfer daemon, and the sheet
/// dismisses. Fire-and-forget: re-sharing a PDF just overwrites the same
/// filename on the shelf, so a lost upload heals by sharing again. Staged
/// files are swept two days later on the next share.
final class ShareViewController: UIViewController {
    private let card = UIView()
    private let titleLabel = UILabel()
    private let statusLabel = UILabel()
    private let progress = UIProgressView(progressViewStyle: .default)
    private let sendButton = UIButton(type: .system)
    private let cancelButton = UIButton(type: .system)

    private var attachments: [NSItemProvider] = []
    private var failed = 0

    // JournalReader's house look: soft pink on near-black.
    private let ink = UIColor(red: 0.12, green: 0.11, blue: 0.12, alpha: 1)
    private let dim = UIColor(red: 0.55, green: 0.52, blue: 0.54, alpha: 1)
    private let accent = UIColor(red: 1.0, green: 0.7, blue: 0.8, alpha: 1)
    private let paper = UIColor(red: 0.99, green: 0.97, blue: 0.98, alpha: 1)

    override func viewDidLoad() {
        super.viewDidLoad()
        attachments = (extensionContext?.inputItems as? [NSExtensionItem] ?? [])
            .flatMap { $0.attachments ?? [] }
            .filter { $0.hasItemConformingToTypeIdentifier(UTType.pdf.identifier) }
        buildUI()
    }

    // MARK: - UI

    private func buildUI() {
        view.backgroundColor = UIColor.black.withAlphaComponent(0.35)

        card.backgroundColor = paper
        card.layer.cornerRadius = 12          // rounded rectangle, never a pill
        card.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(card)

        titleLabel.text = attachments.isEmpty
            ? "No PDFs here"
            : "Send \(attachments.count) journal PDF\(attachments.count == 1 ? "" : "s")"
        titleLabel.font = .systemFont(ofSize: 18, weight: .semibold)
        titleLabel.textColor = ink

        statusLabel.text = attachments.isEmpty
            ? "Only PDF scans can go onto the journal shelf."
            : "Lands on your private journal shelf, ready for extraction."
        statusLabel.font = .systemFont(ofSize: 13)
        statusLabel.textColor = dim
        statusLabel.numberOfLines = 0

        progress.progressTintColor = accent
        progress.isHidden = true

        sendButton.setTitle("Send it", for: .normal)
        sendButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        sendButton.setTitleColor(.white, for: .normal)
        sendButton.backgroundColor = accent
        sendButton.layer.cornerRadius = 6
        sendButton.isEnabled = !attachments.isEmpty
        sendButton.alpha = attachments.isEmpty ? 0.45 : 1
        sendButton.addTarget(self, action: #selector(send), for: .touchUpInside)

        cancelButton.setTitle("Cancel", for: .normal)
        cancelButton.setTitleColor(dim, for: .normal)
        cancelButton.addTarget(self, action: #selector(cancel), for: .touchUpInside)

        let stack = UIStackView(arrangedSubviews: [
            titleLabel, statusLabel, progress, sendButton, cancelButton,
        ])
        stack.axis = .vertical
        stack.spacing = 12
        stack.setCustomSpacing(6, after: titleLabel)
        stack.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(stack)

        NSLayoutConstraint.activate([
            card.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            card.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            card.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
            card.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
            stack.topAnchor.constraint(equalTo: card.topAnchor, constant: 20),
            stack.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 20),
            stack.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -20),
            stack.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -20),
            sendButton.heightAnchor.constraint(equalToConstant: 46),
        ])
    }

    // MARK: - Sending

    @objc private func cancel() {
        extensionContext?.cancelRequest(withError: NSError(domain: "Journal", code: 0))
    }

    @objc private func send() {
        sendButton.isEnabled = false
        sendButton.alpha = 0.45
        cancelButton.isHidden = true
        progress.isHidden = false
        progress.progress = 0
        statusLabel.text = "Handing off…"

        Task {
            let fm = FileManager.default
            guard let container = fm.containerURL(
                forSecurityApplicationGroupIdentifier: Self.appGroup) else {
                await MainActor.run { self.stageFailed("No shared container — reinstall the app.") }
                return
            }
            let outbox = container.appendingPathComponent("journalshare-outbox", isDirectory: true)
            try? fm.createDirectory(at: outbox, withIntermediateDirectories: true)
            Self.sweepOutbox(outbox)

            let bg = Self.makeBackgroundSession()
            var queued = 0
            for (i, provider) in attachments.enumerated() {
                do {
                    let tmp = try await Self.loadFile(from: provider)
                    let staged = outbox.appendingPathComponent(
                        UUID().uuidString + "-" + tmp.lastPathComponent)
                    try fm.moveItem(at: tmp, to: staged)
                    bg.uploadTask(with: uploadRequest(for: staged), fromFile: staged).resume()
                    queued += 1
                } catch {
                    failed += 1
                }
                let done = Float(i + 1) / Float(attachments.count)
                await MainActor.run { progress.setProgress(done, animated: true) }
            }
            await MainActor.run { self.finishQueued(queued) }
        }
    }

    private func finishQueued(_ queued: Int) {
        if failed == 0 {
            // Queued with the system — uploads keep going with the phone locked.
            extensionContext?.completeRequest(returningItems: nil)
        } else {
            titleLabel.text = queued > 0 ? "Sending \(queued), \(failed) unreadable" : "Couldn't read those"
            statusLabel.text = queued > 0
                ? "The unreadable ones are still on your phone — share them again."
                : "Nothing could be read from that share."
            progress.isHidden = true
            sendButton.setTitle("Done", for: .normal)
            sendButton.isEnabled = true
            sendButton.alpha = 1
            sendButton.removeTarget(self, action: #selector(send), for: .touchUpInside)
            sendButton.addTarget(self, action: #selector(dismissDone), for: .touchUpInside)
        }
    }

    private func stageFailed(_ message: String) {
        titleLabel.text = "Couldn't hand off"
        statusLabel.text = message
        progress.isHidden = true
        sendButton.setTitle("Done", for: .normal)
        sendButton.isEnabled = true
        sendButton.alpha = 1
        sendButton.removeTarget(self, action: #selector(send), for: .touchUpInside)
        sendButton.addTarget(self, action: #selector(dismissDone), for: .touchUpInside)
    }

    @objc private func dismissDone() {
        extensionContext?.completeRequest(returningItems: nil)
    }

    /// Copy the shared item to a temp file. `loadFileRepresentation` hands back
    /// a URL only valid inside the callback, so copy it out before returning.
    private static func loadFile(from provider: NSItemProvider) async throws -> URL {
        try await withCheckedThrowingContinuation { cont in
            provider.loadFileRepresentation(forTypeIdentifier: UTType.pdf.identifier) { url, error in
                if let error { return cont.resume(throwing: error) }
                guard let url else {
                    return cont.resume(throwing: NSError(domain: "Journal", code: 1, userInfo: [
                        NSLocalizedDescriptionKey: "Couldn't read the shared file",
                    ]))
                }
                let dest = FileManager.default.temporaryDirectory
                    .appendingPathComponent(UUID().uuidString + "-" + url.lastPathComponent)
                do {
                    try FileManager.default.copyItem(at: url, to: dest)
                    cont.resume(returning: dest)
                } catch {
                    cont.resume(throwing: error)
                }
            }
        }
    }

    private func uploadRequest(for file: URL) -> URLRequest {
        // The staged name carries a UUID prefix so re-shares can't collide in
        // the outbox — strip it back off so the shelf keeps the real filename
        // (that's the manifest key, and re-sharing should overwrite, not fork).
        var name = file.lastPathComponent
        if name.count > 37, name.prefix(37).hasSuffix("-") { name = String(name.dropFirst(37)) }
        var comps = URLComponents(string: Self.server + "/api/journal/upload-file")!
        comps.queryItems = [.init(name: "filename", value: name)]
        var req = URLRequest(url: comps.url!)
        req.httpMethod = "POST"
        req.setValue("application/pdf", forHTTPHeaderField: "Content-Type")
        return req
    }

    // Staged files can't be deleted on completion (nobody is around to hear
    // it) — sweep anything older than two days on the next share instead.
    private static func sweepOutbox(_ dir: URL) {
        let fm = FileManager.default
        guard let files = try? fm.contentsOfDirectory(
            at: dir, includingPropertiesForKeys: [.contentModificationDateKey]) else { return }
        let cutoff = Date().addingTimeInterval(-48 * 3600)
        for f in files {
            let mod = (try? f.resourceValues(forKeys: [.contentModificationDateKey])
                .contentModificationDate) ?? .distantPast
            if mod < cutoff { try? fm.removeItem(at: f) }
        }
    }

    private static let server = "https://imageforge-q125.onrender.com"
    // Shared with the Deck Factory apps — app groups are account-wide, and
    // reusing the registered one means no new portal registration.
    private static let appGroup = "group.com.sageryza.imageforge"

    private static func makeBackgroundSession() -> URLSession {
        let config = URLSessionConfiguration.background(
            withIdentifier: "com.sageryza.journal.share." + UUID().uuidString)
        config.sharedContainerIdentifier = appGroup
        config.isDiscretionary = false
        config.sessionSendsLaunchEvents = false
        return URLSession(configuration: config)
    }
}
