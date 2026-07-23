import SwiftUI
import UniformTypeIdentifiers
import FirebaseAuth
import FirebaseStorage

/// One-time backfill helper: pick your journal scans (PDFs) and push them to
/// Firebase Storage so the extraction pipeline can pull them.
///
/// The PDFs upload over a BACKGROUND URLSession, so you can leave the app (or
/// even let iOS kill it) and the transfer keeps going — the system relaunches
/// the app when it finishes. The Firebase SDK can't do background sessions,
/// so the PDFs go straight to the Storage REST endpoint with the signed-in
/// user's token; only the small manifest index still goes through the SDK.
enum JournalUploadConfig {
    static let folder = "journal-scans"
    static let bucket = "membry-df528.firebasestorage.app"
    static let sessionID = "com.sageryza.journal.bg-upload"
}

struct JournalScanRecord: Codable {
    var month: String?
    var name: String
    var size: Int
    var url: String
    var uploadedAt: Double
}

/// Stores the system's background-session completion handler so uploads that
/// finish after the app was relaunched still get reported to iOS.
final class JournalAppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     handleEventsForBackgroundURLSession identifier: String,
                     completionHandler: @escaping () -> Void) {
        JournalUploader.shared.backgroundCompletionHandler = completionHandler
    }
}

final class JournalUploader: NSObject, ObservableObject, URLSessionDataDelegate {
    enum Phase: Equatable { case idle, working, done, failed(String) }

    static let shared = JournalUploader()

    @Published var phase: Phase = .idle
    @Published var statusLines: [String] = []
    @Published var manifestURL: String?

    var backgroundCompletionHandler: (() -> Void)?

    private lazy var storage = Storage.storage()
    private lazy var session: URLSession = {
        let cfg = URLSessionConfiguration.background(withIdentifier: JournalUploadConfig.sessionID)
        cfg.sessionSendsLaunchEvents = true    // relaunch the app when done
        cfg.isDiscretionary = false            // start now, not when iOS feels like it
        return URLSession(configuration: cfg, delegate: self, delegateQueue: nil)
    }()

    // Delegate-side state (touched off the main thread).
    private var responseBuffers: [Int: Data] = [:]
    private var pendingRecords: [JournalScanRecord] = []
    private var remaining = 0
    private var failures = 0

    /// Best-effort month guess from the filename (the pipeline does the
    /// authoritative parse; this is just to make the index readable).
    private func monthGuess(_ name: String) -> String? {
        let n = name.lowercased()
        let months = ["january","february","march","april","may","june",
                      "july","august","september","october","november","december"]
        return months.first { n.contains($0) || n.contains(String($0.prefix(3))) }
    }

    func upload(_ urls: [URL]) {
        guard !urls.isEmpty else { return }
        phase = .working
        statusLines = []
        pendingRecords = []
        failures = 0
        Task { @MainActor in
            if Auth.auth().currentUser == nil {
                try? await Auth.auth().signInAnonymously()
            }
            guard let user = Auth.auth().currentUser,
                  let token = try? await user.getIDToken() else {
                phase = .failed("Couldn't sign in — check your connection and try again.")
                return
            }
            // Background uploads read from a file that must outlive the file
            // picker's security scope, so stage each PDF in our own caches.
            let staging = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            var queued = 0
            for url in urls {
                let name = url.lastPathComponent
                let scoped = url.startAccessingSecurityScopedResource()
                defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                let dest = staging.appendingPathComponent(name)
                try? FileManager.default.removeItem(at: dest)
                do { try FileManager.default.copyItem(at: url, to: dest) } catch {
                    append("⚠︎ couldn’t read \(name) — skipped"); continue
                }
                let size = (try? FileManager.default.attributesOfItem(atPath: dest.path)[.size] as? Int).flatMap { $0 } ?? 0

                var comps = URLComponents(string: "https://firebasestorage.googleapis.com/v0/b/\(JournalUploadConfig.bucket)/o")!
                comps.queryItems = [URLQueryItem(name: "name", value: "\(JournalUploadConfig.folder)/\(name)")]
                var req = URLRequest(url: comps.url!)
                req.httpMethod = "POST"
                req.setValue("application/pdf", forHTTPHeaderField: "Content-Type")
                req.setValue("Firebase \(token)", forHTTPHeaderField: "Authorization")

                let task = session.uploadTask(with: req, fromFile: dest)
                task.taskDescription = "\(name)|\(size)"
                task.resume()
                queued += 1
                append("↑ uploading \(name) (\(size / 1_000_000) MB) — you can leave the app, it keeps going")
            }
            remaining = queued
            if queued == 0 { phase = .failed("Nothing could be read to upload.") }
        }
    }

    // MARK: URLSession delegate (background queue)

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        responseBuffers[dataTask.taskIdentifier, default: Data()].append(data)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        let parts = (task.taskDescription ?? "?|0").split(separator: "|")
        let name = String(parts.first ?? "?")
        let size = Int(parts.last ?? "0") ?? 0
        let body = responseBuffers.removeValue(forKey: task.taskIdentifier)
        let code = (task.response as? HTTPURLResponse)?.statusCode

        DispatchQueue.main.async {
            if let error {
                self.failures += 1
                self.append("✗ \(name): \(error.localizedDescription)")
            } else if let code, !(200..<300).contains(code) {
                self.failures += 1
                self.append("✗ \(name): the server said \(code)")
            } else {
                // The upload response is the object's metadata — pull the
                // download token out of it to build a shareable URL.
                var dl = ""
                if let body,
                   let meta = try? JSONSerialization.jsonObject(with: body) as? [String: Any],
                   let tok = (meta["downloadTokens"] as? String)?.split(separator: ",").first {
                    let enc = "\(JournalUploadConfig.folder)/\(name)"
                        .addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? ""
                    dl = "https://firebasestorage.googleapis.com/v0/b/\(JournalUploadConfig.bucket)/o/\(enc)?alt=media&token=\(tok)"
                }
                self.pendingRecords.append(JournalScanRecord(
                    month: self.monthGuess(name), name: name, size: size,
                    url: dl, uploadedAt: Date().timeIntervalSince1970))
                self.append("✓ sent \(name)")
            }
            self.remaining -= 1
            if self.remaining <= 0 { self.finishBatch() }
        }
    }

    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        DispatchQueue.main.async {
            self.backgroundCompletionHandler?()
            self.backgroundCompletionHandler = nil
        }
    }

    private func finishBatch() {
        let records = pendingRecords
        let failed = failures
        Task { @MainActor in
            try? await writeManifest(records)   // best-effort: the index is a convenience
            phase = failed > 0
                ? .failed("\(failed) upload\(failed == 1 ? "" : "s") failed — tap Choose to retry them.")
                : .done
        }
    }

    /// Merge new records into the existing manifest (so re-runs accumulate);
    /// newest record per filename wins. No forced download token — Firebase
    /// rejects client-set tokens with a 400 now (that was the "unknown 400"),
    /// and the pipeline lists the folder with authenticated calls anyway.
    private func writeManifest(_ newRecords: [JournalScanRecord]) async throws {
        guard !newRecords.isEmpty else { return }
        let ref = storage.reference(withPath: "\(JournalUploadConfig.folder)/manifest.json")
        var all: [String: JournalScanRecord] = [:]
        if let existing = try? await ref.data(maxSize: 5 * 1024 * 1024),
           let decoded = try? JSONDecoder().decode([JournalScanRecord].self, from: existing) {
            for r in decoded { all[r.name] = r }
        }
        for r in newRecords { all[r.name] = r }               // newest wins
        let merged = Array(all.values).sorted { $0.name < $1.name }
        let body = try JSONEncoder().encode(merged)
        let meta = StorageMetadata()
        meta.contentType = "application/json"
        _ = try await ref.putDataAsync(body, metadata: meta)
        manifestURL = (try? await ref.downloadURL())?.absoluteString
        append("📄 index updated — \(merged.count) scan(s) total")
    }

    private func append(_ s: String) {
        if Thread.isMainThread { statusLines.append(s) }
        else { DispatchQueue.main.async { self.statusLines.append(s) } }
    }
}

struct JournalUploadView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var uploader = JournalUploader.shared
    @State private var picking = false

    private let accent = Color(red: 1.0, green: 0.7, blue: 0.8)

    var body: some View {
        NavigationView {
            VStack(spacing: 18) {
                Image(systemName: "arrow.up.doc.on.clipboard")
                    .font(.system(size: 46, weight: .light))
                    .foregroundStyle(accent)
                    .padding(.top, 24)
                Text("Send journals to Claude")
                    .font(.title2.weight(.semibold))
                Text("Pick your scanned journal PDFs. They upload to your private "
                     + "cloud in the background — you can leave the app and the "
                     + "transfer keeps going on its own.")
                    .font(.subheadline)
                    .foregroundColor(.gray)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 28)

                Button {
                    picking = true
                } label: {
                    Text(uploader.phase == .working ? "Uploading…" : "Choose journal PDFs")
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(accent)
                        .foregroundColor(.white)
                        .cornerRadius(6)          // rounded rectangle, no pills
                }
                .disabled(uploader.phase == .working)
                .padding(.horizontal, 28)

                if !uploader.statusLines.isEmpty {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 4) {
                            ForEach(Array(uploader.statusLines.enumerated()), id: \.offset) { _, line in
                                Text(line).font(.footnote.monospaced())
                                    .foregroundColor(.secondary)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                        .padding(.horizontal, 28)
                    }
                    .frame(maxHeight: 220)
                }

                if uploader.phase == .done {
                    VStack(spacing: 8) {
                        Text("Done — sent to your cloud ✓").foregroundColor(.green).fontWeight(.semibold)
                        Text("Tell your Claude chat “pull my journals” and it’ll fetch them.")
                            .font(.caption).foregroundColor(.gray).multilineTextAlignment(.center)
                        if let u = uploader.manifestURL {
                            Button {
                                UIPasteboard.general.string = u
                            } label: {
                                Label("Copy link for Claude", systemImage: "doc.on.doc")
                                    .font(.caption)
                            }
                        }
                    }
                    .padding(.horizontal, 28)
                }

                if case .failed(let why) = uploader.phase {
                    Text(why)
                        .font(.caption).foregroundColor(.red)
                        .multilineTextAlignment(.center).padding(.horizontal, 28)
                }

                Spacer()
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .fileImporter(isPresented: $picking,
                          allowedContentTypes: [UTType.pdf],
                          allowsMultipleSelection: true) { result in
                if case .success(let urls) = result { uploader.upload(urls) }
            }
        }
    }
}
