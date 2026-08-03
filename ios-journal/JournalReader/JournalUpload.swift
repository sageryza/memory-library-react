import SwiftUI
import PDFKit
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

    init(month: String?, name: String, size: Int, url: String, uploadedAt: Double) {
        self.month = month; self.name = name; self.size = size
        self.url = url; self.uploadedAt = uploadedAt
    }

    // uploadedAt is seconds (Double) from this app and the server route, but
    // one live record carries an ISO string — decode both, so a single odd
    // record can't fail the whole index decode (which silently DROPPED every
    // existing entry on the next manifest merge).
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        month = try? c.decode(String.self, forKey: .month)
        name = try c.decode(String.self, forKey: .name)
        size = (try? c.decode(Int.self, forKey: .size)) ?? 0
        url = (try? c.decode(String.self, forKey: .url)) ?? ""
        if let d = try? c.decode(Double.self, forKey: .uploadedAt) {
            uploadedAt = d
        } else if let s = try? c.decode(String.self, forKey: .uploadedAt) {
            let f = ISO8601DateFormatter()
            f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            let g = ISO8601DateFormatter()
            uploadedAt = (f.date(from: s) ?? g.date(from: s))?.timeIntervalSince1970 ?? 0
        } else {
            uploadedAt = 0
        }
    }
}

/// Shelf covers, kept for the app's lifetime so re-opening the sheet doesn't
/// re-download them. A cover is page 1 of the scan, rendered server-side at
/// its true aspect ratio and stored PRIVATE beside the PDF
/// (`journal-scans/thumbs/<name>.png`) — read with the signed-in user's token,
/// never a public URL.
enum JournalCovers {
    static var cache: [String: UIImage] = [:]
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
                Task.detached(priority: .utility) { await Self.makeCover(name: name, pdf: dest) }
                queued += 1
                append("↑ uploading \(name) (\(size / 1_000_000) MB) — you can leave the app, it keeps going")
            }
            remaining = queued
            if queued == 0 { phase = .failed("Nothing could be read to upload.") }
        }
    }

    /// Stand the book up on the shelf: page 1 as a ~500px-wide PNG at the
    /// page's TRUE shape, stored beside the scan. The server renders this for
    /// anything shared in through the share sheet; PDFs picked here go
    /// straight to Storage and never touch the server, so they render it on
    /// device (PDFKit, costs nothing, the page loads lazily so a huge scan is
    /// fine). A cover that doesn't make it just leaves a plain slot on the
    /// shelf — `scripts/journal-thumbs.js` fills those in.
    private static func makeCover(name: String, pdf: URL) async {
        guard let doc = PDFDocument(url: pdf), let page = doc.page(at: 0) else { return }
        let box = page.bounds(for: .mediaBox)
        guard box.width > 0, box.height > 0 else { return }
        let width: CGFloat = 500
        let size = CGSize(width: width, height: (width * box.height / box.width).rounded())
        guard let png = page.thumbnail(of: size, for: .mediaBox).pngData() else { return }
        let ref = Storage.storage()
            .reference(withPath: "\(JournalUploadConfig.folder)/thumbs/\(name).png")
        let meta = StorageMetadata()
        meta.contentType = "image/png"
        _ = try? await ref.putDataAsync(png, metadata: meta)
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
    // What's already on the journal-scans shelf, straight from the manifest —
    // so "which journals are up there?" has an answer in the app (Aug 2026).
    @State private var shelf: [JournalScanRecord] = []
    @State private var shelfNote: String?
    @State private var covers: [String: UIImage] = JournalCovers.cache

    private let accent = Color(red: 1.0, green: 0.7, blue: 0.8)
    private let bookHeight: CGFloat = 116
    private let bookGap: CGFloat = 12

    /// The share extension and iOS exports prefix filenames with UUIDs —
    /// peel them all off so the shelf reads as her own titles.
    private func cleanName(_ n: String) -> String {
        var s = n
        while s.count > 37, s.prefix(37).hasSuffix("-"),
              UUID(uuidString: String(s.prefix(36))) != nil {
            s = String(s.dropFirst(37))
        }
        return s
    }

    /// The title on the shelf label — her own name for it, no extension.
    private func title(_ r: JournalScanRecord) -> String {
        let n = cleanName(r.name)
        return n.lowercased().hasSuffix(".pdf") ? String(n.dropLast(4)) : n
    }

    /// Rough chronological order read off the filename — nothing stamps the
    /// real journal date. Takes the START month and day ("Sep 6 - Oct 9 big
    /// boy" → Sep 6). A 4-digit year in the name wins; without one the journal
    /// is taken as the 2025 season, which is what puts "january 3 - january
    /// 2026" after "Nov 4th". Journals with no date in the name ("kraft
    /// journals 2") sit at the end, in the order they were sent up.
    private func sortKey(_ r: JournalScanRecord) -> Double {
        let n = title(r).lowercased()
        let chars = Array(n)
        let months = ["january", "february", "march", "april", "may", "june",
                      "july", "august", "september", "october", "november", "december"]

        var hit: (at: Int, month: Int)?
        for (i, m) in months.enumerated() {
            for probe in [m, String(m.prefix(3))] {
                guard let range = n.range(of: probe) else { continue }
                let at = n.distance(from: n.startIndex, to: range.lowerBound)
                if at > 0, chars[at - 1].isLetter { continue }        // must start a word
                if hit == nil || at < hit!.at { hit = (at, i + 1) }
            }
        }
        guard let hit else { return 9e9 + r.uploadedAt }

        // First run of digits after the month word is the day ("Sep 6", "Oct 17th").
        var day = 1
        var digits = ""
        var j = hit.at + 3
        while j < chars.count, j < hit.at + 18 {
            if chars[j].isNumber { digits.append(chars[j]); if digits.count == 2 { break } }
            else if !digits.isEmpty { break }
            j += 1
        }
        if let d = Int(digits), (1...31).contains(d) { day = d }

        // A real year anywhere in the name overrides the assumed season.
        var year = 2025
        var k = 0
        while k + 3 < chars.count {
            if chars[k].isNumber, chars[k + 1].isNumber, chars[k + 2].isNumber, chars[k + 3].isNumber,
               let v = Int(String(chars[k...(k + 3)])), (1990...2100).contains(v),
               k == 0 || !chars[k - 1].isNumber,
               k + 4 >= chars.count || !chars[k + 4].isNumber {
                year = v
                break
            }
            k += 1
        }
        return Double(year * 10_000 + hit.month * 100 + day)
    }

    private func loadShelf() async {
        if Auth.auth().currentUser == nil {
            try? await Auth.auth().signInAnonymously()
        }
        let ref = Storage.storage().reference(withPath: "\(JournalUploadConfig.folder)/manifest.json")
        guard let data = try? await ref.data(maxSize: 5 * 1024 * 1024),
              let decoded = try? JSONDecoder().decode([JournalScanRecord].self, from: data) else {
            shelfNote = "Couldn't read the shelf right now."
            return
        }
        shelfNote = nil
        shelf = decoded.sorted { sortKey($0) < sortKey($1) }
        await loadCovers(shelf)
    }

    /// Pull each cover in turn (they're ~150KB) so books stand up one by one
    /// instead of the shelf waiting on the slowest.
    private func loadCovers(_ records: [JournalScanRecord]) async {
        for r in records where covers[r.name] == nil {
            let ref = Storage.storage()
                .reference(withPath: "\(JournalUploadConfig.folder)/thumbs/\(r.name).png")
            guard let data = try? await ref.data(maxSize: 4 * 1024 * 1024),
                  let img = UIImage(data: data) else { continue }
            JournalCovers.cache[r.name] = img
            covers[r.name] = img
        }
    }

    // ── shelf layout ──
    // Books keep their real proportions: every cover is the same HEIGHT and
    // takes whatever width its page shape gives it, so a fat journal is wide
    // and a slim one is narrow. Widths are measured here, then rows are filled
    // left to right until the next book won't fit.

    private struct ShelfBook: Identifiable {
        let rec: JournalScanRecord
        let width: CGFloat
        var id: String { rec.name }
    }

    private func rows(width: CGFloat) -> [[ShelfBook]] {
        guard width > 0 else { return [] }
        var out: [[ShelfBook]] = []
        var row: [ShelfBook] = []
        var used: CGFloat = 0
        for r in shelf {
            // Until a cover arrives, hold a plain portrait slot for it.
            var ratio: CGFloat = 0.72
            if let img = covers[r.name], img.size.height > 0 {
                ratio = min(1.6, max(0.35, img.size.width / img.size.height))
            }
            let w = min(width, (bookHeight * ratio).rounded())
            if !row.isEmpty, used + bookGap + w > width {
                out.append(row); row = []; used = 0
            }
            used += (row.isEmpty ? 0 : bookGap) + w
            row.append(ShelfBook(rec: r, width: w))
        }
        if !row.isEmpty { out.append(row) }
        return out
    }

    private func shelfBody(width: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            ForEach(Array(rows(width: width).enumerated()), id: \.offset) { _, row in
                VStack(alignment: .leading, spacing: 0) {
                    HStack(alignment: .bottom, spacing: bookGap) {
                        ForEach(row) { b in
                            if let img = covers[b.rec.name] {
                                Image(uiImage: img)
                                    .resizable()
                                    .scaledToFill()
                                    .frame(width: b.width, height: bookHeight)
                                    .clipped()
                                    .overlay(Rectangle().strokeBorder(Color.primary.opacity(0.14),
                                                                      lineWidth: 0.5))
                            } else {
                                Rectangle()
                                    .fill(Color.primary.opacity(0.06))
                                    .frame(width: b.width, height: bookHeight)
                            }
                        }
                        Spacer(minLength: 0)
                    }
                    Rectangle()                                  // the shelf: just a line
                        .fill(Color.primary.opacity(0.22))
                        .frame(height: 1)
                    HStack(alignment: .top, spacing: bookGap) {
                        ForEach(row) { b in
                            Text(title(b.rec))
                                .font(.system(size: 9))
                                .foregroundColor(.secondary)
                                .lineLimit(2)
                                .multilineTextAlignment(.leading)
                                .frame(width: b.width, alignment: .leading)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.top, 5)
                }
            }
        }
    }

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

                // ── On the shelf: the journals already up there, standing on
                // their covers in rough date order ──
                if !shelf.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("On the shelf — \(shelf.count) journal\(shelf.count == 1 ? "" : "s")")
                            .font(.footnote.weight(.semibold))
                            .foregroundColor(.secondary)
                        GeometryReader { geo in
                            ScrollView {
                                shelfBody(width: geo.size.width)
                                    .padding(.bottom, 16)
                            }
                        }
                    }
                    .padding(.horizontal, 28)
                    .padding(.top, 6)
                } else if let shelfNote {
                    Text(shelfNote)
                        .font(.caption).foregroundColor(.secondary)
                        .padding(.horizontal, 28)
                    Spacer()
                } else {
                    Spacer()
                }
            }
            .task { await loadShelf() }
            .onChange(of: uploader.phase) { _, newPhase in
                if newPhase == .done { Task { await loadShelf() } }
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
