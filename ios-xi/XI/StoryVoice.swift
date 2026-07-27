import AVFoundation
import Foundation

// XI is a storytelling game, so a turn can be TOLD rather than typed: you tap
// the mic, tell the memory out loud, and everyone else presses play and hears
// it. This file is the audio half of that — recording your turn, and playing
// back one story at a time in the feed.

/// Records a spoken story to a temporary m4a. Voice-grade AAC (mono, 22.05k,
/// 32 kbps) so five minutes is ~1.2 MB — small enough to hand to the
/// `tellStory` function in one call, and plenty for transcription.
@MainActor
final class StoryRecorder: NSObject, ObservableObject {
    /// Stories are a turn in a game, not a podcast — long enough to tell one
    /// properly, short enough that nobody waits on an upload.
    static let maxSeconds: TimeInterval = 300

    @Published private(set) var isRecording = false
    @Published private(set) var seconds: TimeInterval = 0
    /// The finished take, ready to save. Re-recording replaces it.
    @Published private(set) var recordedURL: URL?
    @Published var permissionDenied = false

    private var recorder: AVAudioRecorder?
    private var timer: Timer?

    var hasRecording: Bool { recordedURL != nil }

    /// mm:ss for the composer's counter.
    var clock: String {
        let s = Int(seconds.rounded())
        return String(format: "%d:%02d", s / 60, s % 60)
    }

    func start() {
        requestPermission { [weak self] granted in
            guard let self else { return }
            guard granted else { self.permissionDenied = true; return }
            self.beginRecording()
        }
    }

    func stop() {
        recorder?.stop()
        recorder = nil
        timer?.invalidate(); timer = nil
        isRecording = false
        // Playback elsewhere in the app expects a normal session back.
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    /// Throw the take away and start over (the composer's "record again").
    func reset() {
        stop()
        if let url = recordedURL { try? FileManager.default.removeItem(at: url) }
        recordedURL = nil
        seconds = 0
    }

    /// The bytes to upload, and how long they run.
    func take() -> (data: Data, seconds: Double)? {
        guard let url = recordedURL, let data = try? Data(contentsOf: url), !data.isEmpty else { return nil }
        return (data, Double(seconds))
    }

    private func beginRecording() {
        if let old = recordedURL { try? FileManager.default.removeItem(at: old) }
        recordedURL = nil
        seconds = 0
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("xi-story-\(UUID().uuidString).m4a")
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 22050,
            AVNumberOfChannelsKey: 1,
            AVEncoderBitRateKey: 32000,
        ]
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .spokenAudio, options: [.defaultToSpeaker, .allowBluetooth])
            try session.setActive(true)
            let rec = try AVAudioRecorder(url: url, settings: settings)
            rec.delegate = self
            guard rec.record(forDuration: Self.maxSeconds) else { return }
            recorder = rec
            isRecording = true
            timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
                Task { @MainActor in
                    guard let self, let r = self.recorder, r.isRecording else { return }
                    self.seconds = r.currentTime
                }
            }
        } catch {
            isRecording = false
        }
    }

    private func requestPermission(_ done: @escaping (Bool) -> Void) {
        let hand: (Bool) -> Void = { granted in Task { @MainActor in done(granted) } }
        if #available(iOS 17.0, *) {
            AVAudioApplication.requestRecordPermission(completionHandler: hand)
        } else {
            AVAudioSession.sharedInstance().requestRecordPermission(hand)
        }
    }
}

extension StoryRecorder: AVAudioRecorderDelegate {
    nonisolated func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        let url = recorder.url
        let length = recorder.currentTime
        Task { @MainActor in
            self.timer?.invalidate(); self.timer = nil
            self.isRecording = false
            self.recorder = nil
            // currentTime reads 0 once stopped, so keep whatever the ticker saw.
            if length > 0 { self.seconds = length }
            self.recordedURL = flag ? url : nil
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
    }
}

/// One story plays at a time, app-wide: tapping a second ▶ stops the first.
/// `nowPlaying` is the story id (or "preview" in the composer) so each row can
/// draw its own play/stop state.
@MainActor
final class StoryAudioPlayer: NSObject, ObservableObject {
    static let shared = StoryAudioPlayer()

    @Published private(set) var nowPlaying: String?

    private var player: AVPlayer?
    private var endObserver: NSObjectProtocol?

    func toggle(id: String, url: URL) {
        if nowPlaying == id { stop(); return }
        stop()
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
        try? AVAudioSession.sharedInstance().setActive(true)
        let item = AVPlayerItem(url: url)
        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.stop() }
        }
        let p = AVPlayer(playerItem: item)
        player = p
        nowPlaying = id
        p.play()
    }

    func stop() {
        player?.pause()
        player = nil
        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
        endObserver = nil
        nowPlaying = nil
    }
}

/// "1:04" for a duration in seconds — the label next to a ▶.
func storyClock(_ seconds: Double) -> String {
    let s = Int(seconds.rounded())
    return String(format: "%d:%02d", s / 60, s % 60)
}
