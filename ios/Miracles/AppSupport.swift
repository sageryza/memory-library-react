import Foundation
import UIKit
import FirebaseFunctions

/// How the app was launched.
enum AppMode {
    /// UI tests launch with `-uitestSeed`: a fixture book, no sign-in, no
    /// cloud, and never a paid draw.
    static let isUITest = ProcessInfo.processInfo.arguments.contains("-uitestSeed")
}

/// UserDefaults keys read by more than one screen.
enum Keys {
    /// 5.1.2(i): she agreed to send her words to the AI services. Off means
    /// withdrawn (Settings), and the next draw asks again.
    static let aiConsent = "miracles.aiConsent.v1"
}

/// Keeps the app running for a short while after she switches away, so a
/// paid drawing that is still on its way can land instead of being lost.
@MainActor
final class BackgroundActivity {
    private var id: UIBackgroundTaskIdentifier = .invalid

    init(name: String) {
        id = UIApplication.shared.beginBackgroundTask(withName: name) { [weak self] in
            // Time is up: end it now, or iOS stops the app.
            MainActor.assumeIsolated {
                guard let self else { return }
                self.end()
            }
        }
    }

    func end() {
        guard id != .invalid else { return }
        UIApplication.shared.endBackgroundTask(id)
        id = .invalid
    }
}

/// Runs its action the first time `fire()` is called, and never again.
final class OneShot: @unchecked Sendable {
    private let lock = NSLock()
    private var action: (() -> Void)?

    init(_ action: @escaping () -> Void) { self.action = action }

    func fire() {
        lock.lock()
        let run = action
        action = nil
        lock.unlock()
        run?()
    }
}

/// Errors in plain words. The server sends friendly messages for daily limits
/// (resource-exhausted), words that can't be drawn (invalid-argument) and a
/// busy or down service (unavailable); everything else gets one plain line.
enum MiraclesErrors {
    static let generic = "Something went wrong. Try again."
    static let offline = "You're offline. Try again when you're connected."

    static func message(for error: Error) -> String {
        let ns = error as NSError
        if ns.domain == FunctionsErrorDomain {
            let code = FunctionsErrorCode(rawValue: ns.code)
            guard code == .resourceExhausted || code == .invalidArgument || code == .unavailable else {
                return generic
            }
            let text = ns.localizedDescription.trimmingCharacters(in: .whitespacesAndNewlines)
            // With no message from the server the SDK puts the bare code name
            // here ("UNAVAILABLE") — that's not words for a person.
            return text.isEmpty || text == text.uppercased() ? generic : text
        }
        if ns.domain == NSURLErrorDomain {
            let noConnection = [
                NSURLErrorNotConnectedToInternet, NSURLErrorDataNotAllowed,
                NSURLErrorInternationalRoamingOff,
            ]
            return noConnection.contains(ns.code) ? offline : generic
        }
        // Firebase Auth's network error (the anonymous sign-in with no connection).
        if ns.domain == "FIRAuthErrorDomain" && ns.code == 17020 { return offline }
        return generic
    }
}
