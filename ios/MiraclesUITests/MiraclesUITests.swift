import XCTest

/// Simulator smoke tests that photograph the app so layout/caching bugs are
/// caught in CI instead of on the user's phone. Screenshots are exported by
/// the workflow as the `miracles-screens` artifact.
final class MiraclesUITests: XCTestCase {

    override func setUpWithError() throws {
        continueAfterFailure = true
    }

    private func shot(_ app: XCUIApplication, _ name: String) {
        let a = XCTAttachment(screenshot: app.screenshot())
        a.name = name
        a.lifetime = .keepAlways
        add(a)
    }

    /// One pass through the big complaints: page hugs content (not a mile-long
    /// sheet), captions show all three lines, ONE keyboard Done button, page
    /// turning, and — after a relaunch — drawings appearing instantly from the
    /// disk cache instead of re-downloading.
    func testBookLayoutKeyboardAndRelaunchCache() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-uitestSeed"]
        app.launch()

        shot(app, "01-first-open")
        sleep(12) // let the four seeded drawings download once (cold cache)
        shot(app, "02-first-open-loaded")

        // Caption/keyboard: focus the first caption (multiline TextField).
        let caption = app.textViews.firstMatch.exists
            ? app.textViews.firstMatch : app.textFields.firstMatch
        if caption.exists {
            caption.tap()
            // The software keyboard can be slow (or need a second tap) on a
            // freshly booted simulator — wait, retry once, then assert.
            let done = app.buttons["Done"].firstMatch
            if !done.waitForExistence(timeout: 5) {
                caption.tap()
                _ = done.waitForExistence(timeout: 5)
            }
            shot(app, "03-keyboard-up")
            // Exactly ONE Done button on the keyboard toolbar.
            let doneCount = app.buttons.matching(NSPredicate(format: "label == 'Done'")).count
            XCTAssertEqual(doneCount, 1, "expected exactly one keyboard Done button, got \(doneCount)")
            if doneCount > 0 { done.tap() }
            sleep(1)
            shot(app, "04-after-done")
        } else {
            XCTFail("no caption field found to focus")
        }

        // Redraw controls are tucked away by default: tap the first drawing to
        // surface them, tap away to hide them again.
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.29, dy: 0.32)).tap()
        sleep(1)
        shot(app, "04b-tap-drawing-controls-appear")
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.09)).tap()
        sleep(1)
        shot(app, "04c-tap-away-controls-hide")

        // Turn forward onto the (new, empty) next page, then back.
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.97, dy: 0.5)).tap()
        sleep(1)
        shot(app, "05-next-empty-page")
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.03, dy: 0.5)).tap()
        sleep(1)

        // Relaunch: drawings must come from the disk cache — visible almost
        // immediately, no re-download spinners.
        app.terminate()
        app.launch()
        usleep(900_000) // 0.9s — far less than any network round-trip for 4 images
        shot(app, "06-relaunch-after-0.9s-should-show-cached-drawings")
        sleep(3)
        shot(app, "07-relaunch-after-4s")
    }

    /// Keep ✓, the AI consent sheet and Settings — all photographed without
    /// ever drawing: test mode can't draw, consent starts unset every run, and
    /// the delete confirmation is only ever cancelled.
    func testKeepConsentAndSettings() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-uitestSeed"]
        app.launch()
        sleep(4) // drawings come from the cache the first test filled

        let firstDrawing = app.coordinate(withNormalizedOffset: CGVector(dx: 0.29, dy: 0.32))

        // Keep ✓: once kept, tapping the drawing brings back only the ✓.
        firstDrawing.tap()
        let keep = app.buttons["Keep this drawing"].firstMatch
        XCTAssertTrue(keep.waitForExistence(timeout: 5), "no keep button after tapping a drawing")
        keep.tap()
        sleep(1)
        firstDrawing.tap()
        sleep(1)
        shot(app, "08-kept-only-the-check-shows")
        XCTAssertTrue(keep.exists, "the ✓ should show on a kept drawing")
        XCTAssertFalse(app.buttons["Redraw"].exists, "redraw should stay hidden while a drawing is kept")
        if keep.exists { keep.tap() } // un-keep: the arrows and redraw come back
        sleep(1)
        shot(app, "08b-unkept-redraw-is-back")

        // Redraw before consent opens the consent sheet; "Not now" leaves it.
        let redraw = app.buttons["Redraw"].firstMatch
        if redraw.waitForExistence(timeout: 5) {
            redraw.tap()
            let agree = app.buttons["Agree & Continue"].firstMatch
            XCTAssertTrue(agree.waitForExistence(timeout: 5), "the AI consent sheet should open")
            sleep(1)
            shot(app, "09-consent-sheet")
            app.buttons["Not now"].firstMatch.tap()
            sleep(1)
        } else {
            XCTFail("redraw should be back after un-keeping")
        }

        // Settings, from the gear.
        let gear = app.buttons["Settings"].firstMatch
        XCTAssertTrue(gear.waitForExistence(timeout: 5), "no settings gear")
        gear.tap()
        XCTAssertTrue(app.switches["Drawing with AI"].firstMatch.waitForExistence(timeout: 5),
                      "settings did not open")
        sleep(1)
        shot(app, "10-settings")

        // The delete confirmation: photographed, then cancelled — never confirmed.
        let delete = app.buttons["Delete my book and data"].firstMatch
        if delete.waitForExistence(timeout: 3) {
            delete.tap()
            let alert = app.alerts.firstMatch
            XCTAssertTrue(alert.waitForExistence(timeout: 5), "no delete confirmation")
            shot(app, "11-delete-confirmation")
            alert.buttons["Cancel"].tap()
            sleep(1)
        } else {
            XCTFail("no delete button in settings")
        }
        app.buttons["Done"].firstMatch.tap()
        sleep(1)
        shot(app, "12-back-on-the-book")
    }
}
