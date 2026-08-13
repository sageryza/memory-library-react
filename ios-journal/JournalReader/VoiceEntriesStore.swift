import Foundation
import AVFoundation
import FirebaseAuth
import FirebaseStorage

/// One voice memo from the archive, as stored in `memo-audio/manifest.json`.
/// Only dreams + journals from 2024 on are surfaced (see `VoiceEntriesStore`);
/// the recording itself lives at `memo-audio/<file>` in Firebase Storage.
struct VoiceEntry: Codable, Identifiable, Hashable {
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
/// through the earpiece/speaker even when the phone is on silent. Publishes the
/// playhead (`currentTime`/`duration`) so a waveform can track it, and seeks.
@MainActor
final class VoicePlayer: ObservableObject {
    /// THE player — every screen must use this one instance.
    ///
    /// "One memo at a time" is only true within a single VoicePlayer: starting
    /// a memo replaces that instance's AVPlayer, but it cannot know about any
    /// other instance. The list, the detail sheet and the voice-entries screen
    /// each held their own `@StateObject VoicePlayer()`, so three recordings
    /// could sound at once — tapping a second memo left the first one playing
    /// underneath it (Sophie, Aug 2026). Bind with
    /// `@ObservedObject private var player = VoicePlayer.shared`, never
    /// `@StateObject private var player = VoicePlayer()`.
    static let shared = VoicePlayer()

    @Published var currentID: String?
    @Published var isPlaying = false
    @Published var currentTime: Double = 0
    @Published var duration: Double = 0

    private var player: AVPlayer?
    private var endObserver: NSObjectProtocol?
    private var timeObserver: Any?

    func play(_ entry: VoiceEntry, url: URL) {
        try? AVAudioSession.sharedInstance().setCategory(.playback)
        try? AVAudioSession.sharedInstance().setActive(true)

        // Silence the outgoing recording before swapping it out. Dropping the
        // last reference usually stops it, but "usually" is audible when it
        // doesn't, so say it explicitly.
        player?.pause()
        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
        if let timeObserver { player?.removeTimeObserver(timeObserver); self.timeObserver = nil }
        let item = AVPlayerItem(url: url)
        let p = AVPlayer(playerItem: item)
        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main
        ) { [weak self] _ in
            self?.isPlaying = false
            self?.currentID = nil
            self?.currentTime = 0
        }
        // Follow the playhead; the real duration lands once the item loads
        // (until then `duration` holds the manifest's stored seconds).
        timeObserver = p.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.25, preferredTimescale: 600), queue: .main
        ) { [weak self] t in
            guard let self else { return }
            self.currentTime = max(0, t.seconds)
            if let d = self.player?.currentItem?.duration.seconds, d.isFinite, d > 0 {
                self.duration = d
            }
        }
        player = p
        currentID = entry.id
        currentTime = 0
        duration = entry.dur.map(Double.init) ?? 0
        isPlaying = true
        p.play()
    }

    func togglePause() {
        guard let player else { return }
        if isPlaying { player.pause(); isPlaying = false }
        else { player.play(); isPlaying = true }
    }

    /// Jump to an absolute position (clamped to the known duration).
    func seek(to seconds: Double) {
        guard let player else { return }
        var t = max(0, seconds)
        if duration > 0 { t = min(t, duration - 0.1) }
        player.seek(to: CMTime(seconds: t, preferredTimescale: 600),
                    toleranceBefore: .zero, toleranceAfter: .zero)
        currentTime = t
    }

    /// Skip forward/back by `seconds` (negative = back).
    func skip(_ seconds: Double) { seek(to: currentTime + seconds) }

    deinit {
        // Swift 5 mode: safe to touch our own stored props while tearing down.
        if let timeObserver { player?.removeTimeObserver(timeObserver) }
        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
    }
}
