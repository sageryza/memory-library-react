import SwiftUI

/// App-wide navigation router. Lets one screen drive another — e.g. tapping a
/// Towers entry jumps the Journal reader to that journal page — without threading
/// bindings through every view. Injected once at the app root.
final class AppRouter: ObservableObject {
    /// The selected bottom-nav destination.
    @Published var tab: JournalTab = .journal

    /// A 1-based journal page the Journal reader should open. Set it (and switch
    /// to `.journal`) to jump there; the reader consumes it and resets to nil.
    @Published var journalTargetPage: Int? = nil

    /// A journal page the Timeline should scroll to and open. Set it (and switch
    /// to `.timeline`); the timeline web view consumes it and resets to nil.
    @Published var timelineTargetPage: Int? = nil

    /// Jump the Journal reader to `page` and bring that tab forward.
    func openJournal(page: Int) {
        journalTargetPage = page
        tab = .journal
    }

    /// Open the Timeline and land on `page` (centered, its text shown).
    func openTimeline(page: Int) {
        timelineTargetPage = page
        tab = .timeline
    }
}
