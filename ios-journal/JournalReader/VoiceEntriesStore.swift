import Foundation
import AVFoundation
import FirebaseAuth
import FirebaseStorage

/// One voice memo from the archive, as stored in `memo-audio/manifest.json`.
/// Only dreams + journals from 2024 on are surfaced (see `VoiceEntriesStore`);
/// the recording itself lives at `memo-audio/<file>` in Firebase Storage.
struct VoiceEntry: Codable, Identifiable {
    let id: String
    let file: String
    let date: String?          // "yyyy-MM-dd"
    let cat: String            // "dream" | "journal" | …
    let title: String?
    let desc: String?
    let transcript: String?
    let dur: Int?              // seconds
}

private struct VoiceManifest: Codable { let memos: [VoiceEntry] }

/// Loads the voice-memo manifest from Firebase Storage (anonymous auth, same as
/// the rest of the app) and hands the app the dream + journal entries to slot
/// into the journal by date. Read-only: uploads happen out-of-band.
@MainActor
final class VoiceEntriesStore: ObservableObject {
    enum Phase: Equatable { case idle, loading, ready, failed(String) }

    @Published var phase: Phase = .idle
    @Published var entries: [VoiceEntry] = []

    private let storage = Storage.storage()

    /// The journal proper begins Jan 2024; earlier memos are held aside for now.
    private static let cutoff = "2024-01-01"

    func loadIfNeeded() {
        switch phase {
        case .ready, .loading: return
        default: load()
        }
    }

    func load() {
        phase = .loading
        Task {
            do {
                try await ensureAuth()
                let ref = storage.reference(withPath: "memo-audio/manifest.json")
                let data = try await ref.data(maxSize: 20 * 1024 * 1024)
                let manifest = try JSONDecoder().decode(VoiceManifest.self, from: data)
                entries = manifest.memos
                    .filter { ($0.cat == "dream" || $0.cat == "journal") && (($0.date ?? "") >= Self.cutoff) }
                    .sorted { ($0.date ?? "") > ($1.date ?? "") }
                phase = .ready
            } catch {
                phase = .failed(error.localizedDescription)
            }
        }
    }

    /// A playable URL for a recording (creates a download token on first use).
    func audioURL(for entry: VoiceEntry) async throws -> URL {
        try await ensureAuth()
        return try await storage.reference(withPath: "memo-audio/\(entry.file)").downloadURL()
    }

    private func ensureAuth() async throws {
        if Auth.auth().currentUser == nil {
            try await Auth.auth().signInAnonymously()
        }
    }
}

/// Single shared audio player for the voice list — one memo at a time, plays
/// through the earpiece/speaker even when the phone is on silent.
@MainActor
final class VoicePlayer: ObservableObject {
    @Published var currentID: String?
    @Published var isPlaying = false

    private var player: AVPlayer?
    private var endObserver: NSObjectProtocol?

    func play(_ entry: VoiceEntry, url: URL) {
        try? AVAudioSession.sharedInstance().setCategory(.playback)
        try? AVAudioSession.sharedInstance().setActive(true)

        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
        let item = AVPlayerItem(url: url)
        let p = AVPlayer(playerItem: item)
        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main
        ) { [weak self] _ in
            self?.isPlaying = false
            self?.currentID = nil
        }
        player = p
        currentID = entry.id
        isPlaying = true
        p.play()
    }

    func togglePause() {
        guard let player else { return }
        if isPlaying { player.pause(); isPlaying = false }
        else { player.play(); isPlaying = true }
    }
}
