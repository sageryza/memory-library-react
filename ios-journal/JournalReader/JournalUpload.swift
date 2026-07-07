import SwiftUI
import UniformTypeIdentifiers
import FirebaseAuth
import FirebaseStorage

/// One-time backfill helper: pick your journal scans (PDFs) and push them to
/// Firebase Storage so the extraction pipeline can pull them. Nothing runs on
/// every launch — you tap this when you have new scans to send. The app is a
/// dumb uploader: it drops each PDF under `journal-scans/` and rewrites a small
/// `manifest.json` index (at a fixed, known download token) listing every scan
/// it has ever sent, with size + download URL. The pipeline reads that index,
/// figures out months, compares sizes, dedupes, and extracts.
///
/// The manifest's fixed token makes it fetchable at a predictable URL:
///   https://firebasestorage.googleapis.com/v0/b/<bucket>/o/journal-scans%2Fmanifest.json?alt=media&token=<MANIFEST_TOKEN>
enum JournalUploadConfig {
    /// Baked-in download token for manifest.json so the pipeline can always
    /// find it without any credentials. (Not a secret — just a stable address;
    /// the scans themselves keep their own random tokens.)
    static let manifestToken = "5a7c1e93-8b2d-4f60-a1c9-6e3d0f24b8a1"
    static let folder = "journal-scans"
}

struct JournalScanRecord: Codable {
    var month: String?
    var name: String
    var size: Int
    var url: String
    var uploadedAt: Double
}

@MainActor
final class JournalUploader: ObservableObject {
    enum Phase: Equatable { case idle, working, done, failed(String) }

    @Published var phase: Phase = .idle
    @Published var statusLines: [String] = []
    @Published var manifestURL: String?

    private lazy var storage = Storage.storage()

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
        Task {
            do {
                if Auth.auth().currentUser == nil {
                    try await Auth.auth().signInAnonymously()
                }
                var records: [JournalScanRecord] = []
                for url in urls {
                    let name = url.lastPathComponent
                    let scoped = url.startAccessingSecurityScopedResource()
                    defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                    guard let data = try? Data(contentsOf: url) else {
                        append("⚠︎ couldn’t read \(name) — skipped"); continue
                    }
                    append("↑ uploading \(name) (\(data.count / 1_000_000) MB)…")
                    let ref = storage.reference(withPath: "\(JournalUploadConfig.folder)/\(name)")
                    let meta = StorageMetadata(); meta.contentType = "application/pdf"
                    _ = try await ref.putDataAsync(data, metadata: meta)
                    let dl = try await ref.downloadURL()
                    records.append(JournalScanRecord(
                        month: monthGuess(name), name: name, size: data.count,
                        url: dl.absoluteString, uploadedAt: Date().timeIntervalSince1970))
                    append("✓ sent \(name)")
                }
                try await writeManifest(records)
                phase = .done
            } catch {
                append("✗ \(error.localizedDescription)")
                phase = .failed(error.localizedDescription)
            }
        }
    }

    /// Merge new records into the existing manifest (so re-runs accumulate) and
    /// re-upload it at the fixed token. Newest record per filename wins.
    private func writeManifest(_ newRecords: [JournalScanRecord]) async throws {
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
        meta.customMetadata = ["firebaseStorageDownloadTokens": JournalUploadConfig.manifestToken]
        _ = try await ref.putDataAsync(body, metadata: meta)
        // Show the real download URL (works regardless of whether the fixed
        // token stuck); the pipeline's `--pull` tries the predictable one first.
        manifestURL = (try? await ref.downloadURL())?.absoluteString
        append("📄 index updated — \(merged.count) scan(s) total")
    }

    private func append(_ s: String) { statusLines.append(s) }
}

struct JournalUploadView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var uploader = JournalUploader()
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
                     + "cloud so the drawing-extraction pipeline can pull them. "
                     + "You only do this when you have new scans — not every launch.")
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
