import AVFoundation
import Foundation
import Speech

// XI is a storytelling game, so a turn can be TOLD rather than typed: you tap
// the mic, tell the memory out loud, and everyone else presses play and hears
// it. This file is the audio half of that — recording your turn (with the words
// appearing as you say them), and playing back one story at a time in the feed.

/// A finished spoken take: the recording, how long it runs, and the words the
/// phone already heard for free while it was being told.
struct SpokenTake {
    let data: Data
    let seconds: Double
    let transcript: String
}

/// Hands audio from the recording thread to whichever speech request is
/// current. The tap runs on a realtime audio thread and must never touch
/// main-actor state, and the request is swapped whenever Apple ends a stretch
/// of recognition, so the two are kept apart behind a lock.
private final class SpeechFeed: @unchecked Sendable {
    private let lock = NSLock()
    private var request: SFSpeechAudioBufferRecognitionRequest?

    func use(_ r: SFSpeechAudioBufferRecognitionRequest?) {
        lock.lock(); request = r; lock.unlock()
    }

    func append(_ buffer: AVAudioPCMBuffer) {
        lock.lock(); let r = request; lock.unlock()
        r?.append(buffer)
    }
}

/// Records a spoken story to a temporary m4a while captioning it live with
/// Apple's on-device recogniser — free, offline, and the words show up as you
/// speak them. Voice-grade AAC (32 kbps) keeps five minutes at ~1.2 MB, small
/// enough to hand to `tellStory` in one call.
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
    /// The words so far, as Apple hears them. Empty when speech recognition
    /// isn't permitted or available — recording still works, it's just silent
    /// on screen and the server transcribes it instead.
    @Published private(set) var liveText = ""

    private var engine: AVAudioEngine?
    private var file: AVAudioFile?
    private var timer: Timer?
    private var startedAt: Date?

    private let recognizer = SFSpeechRecognizer(locale: Locale.current)
    private let feed = SpeechFeed()
    private var task: SFSpeechRecognitionTask?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var speechAllowed = false
    /// Stretches Apple has already finalised, plus the one still in progress.
    private var committed = ""
    private var partial = ""

    var hasRecording: Bool { recordedURL != nil }

    /// mm:ss for the composer's counter.
    var clock: String {
        let s = Int(seconds.rounded())
        return String(format: "%d:%02d", s / 60, s % 60)
    }

    private var joined: String {
        [committed, partial].filter { !$0.isEmpty }.joined(separator: " ")
    }

    func start() {
        requestPermissions { [weak self] micGranted, speechGranted in
            guard let self else { return }
            guard micGranted else { self.permissionDenied = true; return }
            // Speech is a bonus, never a gate: if it's off you still get to
            // tell your story, the words just don't appear as you talk.
            self.speechAllowed = speechGranted
            self.beginRecording()
        }
    }

    func stop() {
        guard isRecording || engine != nil else { return }
        timer?.invalidate(); timer = nil
        if let engine {
            engine.inputNode.removeTap(onBus: 0)
            engine.stop()
        }
        engine = nil
        file = nil                      // the tap is gone, so nothing else writes
        if let startedAt { seconds = min(Self.maxSeconds, Date().timeIntervalSince(startedAt)) }
        startedAt = nil
        isRecording = false
        endRecognition()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    /// Throw the take away and start over (the composer's "record again").
    func reset() {
        stop()
        if let url = recordedURL { try? FileManager.default.removeItem(at: url) }
        recordedURL = nil
        seconds = 0
        committed = ""; partial = ""; liveText = ""
    }

    /// The bytes to upload, how long they run, and the words Apple already
    /// heard — sending that last one is what saves paying to transcribe again.
    func take() -> SpokenTake? {
        guard let url = recordedURL, let data = try? Data(contentsOf: url), !data.isEmpty else { return nil }
        return SpokenTake(data: data, seconds: Double(seconds),
                          transcript: liveText.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    // MARK: recording

    private func beginRecording() {
        if let old = recordedURL { try? FileManager.default.removeItem(at: old) }
        recordedURL = nil
        seconds = 0
        committed = ""; partial = ""; liveText = ""

        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("xi-story-\(UUID().uuidString).m4a")
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .spokenAudio, options: [.defaultToSpeaker, .allowBluetooth])
            try session.setActive(true)

            let engine = AVAudioEngine()
            let input = engine.inputNode
            // The tap's own format — writing the file in the same sample rate
            // and channel count is what lets AVAudioFile take the buffers
            // straight from the tap without a conversion step.
            let format = input.outputFormat(forBus: 0)
            guard format.sampleRate > 0 else { return }
            let audioFile = try AVAudioFile(forWriting: url, settings: [
                AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
                AVSampleRateKey: format.sampleRate,
                AVNumberOfChannelsKey: Int(format.channelCount),
                AVEncoderBitRateKey: 32000,
            ])

            if speechAllowed { startRecognition() }

            let sink = feed
            input.installTap(onBus: 0, bufferSize: 4096, format: format) { buffer, _ in
                try? audioFile.write(from: buffer)
                sink.append(buffer)
            }
            engine.prepare()
            try engine.start()

            self.engine = engine
            self.file = audioFile
            self.recordedURL = nil          // only set once there's a finished take
            startedAt = Date()
            isRecording = true

            let takeURL = url
            timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
                Task { @MainActor in
                    guard let self, let started = self.startedAt else { return }
                    self.seconds = Date().timeIntervalSince(started)
                    if self.seconds >= Self.maxSeconds { self.finish(takeURL) }
                }
            }
            pendingURL = takeURL
        } catch {
            isRecording = false
            engine = nil
            try? FileManager.default.removeItem(at: url)
        }
    }

    /// Where the in-progress take is being written, so stopping can hand it over.
    private var pendingURL: URL?

    /// Stop and keep the take (the mic button and the 5-minute cap both land here).
    func finish(_ url: URL? = nil) {
        let target = url ?? pendingURL
        stop()
        recordedURL = target
        pendingURL = nil
    }

    // MARK: live captions (Apple, on-device, free)

    private func startRecognition() {
        guard let recognizer, recognizer.isAvailable else { return }
        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = true
        // On-device keeps it free, private and offline — and unlike the server
        // path it isn't rationed. Falls back to Apple's servers if this locale
        // hasn't been downloaded.
        if recognizer.supportsOnDeviceRecognition { req.requiresOnDeviceRecognition = true }
        request = req
        feed.use(req)
        task = recognizer.recognitionTask(with: req) { [weak self] result, error in
            Task { @MainActor in
                guard let self, self.isRecording else { return }
                if let result {
                    self.partial = result.bestTranscription.formattedString
                    self.liveText = self.joined
                }
                // Apple closes a stretch of recognition on its own; a five
                // minute story outlives several. Bank what it heard and open
                // a fresh one so the captions keep going.
                if error != nil || (result?.isFinal ?? false) { self.rollRecognition() }
            }
        }
    }

    private func rollRecognition() {
        commitPartial()
        endRecognition()
        guard isRecording, speechAllowed else { return }
        startRecognition()
    }

    private func commitPartial() {
        guard !partial.isEmpty else { return }
        committed = [committed, partial].filter { !$0.isEmpty }.joined(separator: " ")
        partial = ""
        liveText = joined
    }

    private func endRecognition() {
        commitPartial()
        feed.use(nil)
        request?.endAudio()
        task?.cancel()
        request = nil
        task = nil
    }

    // MARK: permissions

    /// Mic first (required), then speech (optional — captions only).
    private func requestPermissions(_ done: @escaping (Bool, Bool) -> Void) {
        let micDone: (Bool) -> Void = { granted in
            guard granted else { Task { @MainActor in done(false, false) }; return }
            SFSpeechRecognizer.requestAuthorization { status in
                Task { @MainActor in done(true, status == .authorized) }
            }
        }
        if #available(iOS 17.0, *) {
            AVAudioApplication.requestRecordPermission(completionHandler: micDone)
        } else {
            AVAudioSession.sharedInstance().requestRecordPermission(micDone)
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
