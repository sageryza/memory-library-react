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
            sleep(1)
            shot(app, "03-keyboard-up")
            // Exactly ONE Done button on the keyboard toolbar.
            let doneCount = app.buttons.matching(NSPredicate(format: "label == 'Done'")).count
            XCTAssertEqual(doneCount, 1, "expected exactly one keyboard Done button, got \(doneCount)")
            if doneCount > 0 { app.buttons["Done"].firstMatch.tap() }
            sleep(1)
            shot(app, "04-after-done")
        } else {
            XCTFail("no caption field found to focus")
        }

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
}
