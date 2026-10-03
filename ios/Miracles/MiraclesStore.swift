import Foundation
import Combine
import Network
import os
import FirebaseAuth
import FirebaseFirestore
import FirebaseFunctions

private let syncLog = Logger(subsystem: "com.sageryza.miracles", category: "book")

/// The book + navigation state — one per app (`shared`), not one per window.
///
/// The book is saved on this phone as JSON the moment anything changes. That
/// copy opens instantly and is the one the app trusts. It is also backed up
/// to Firestore under this install's anonymous account, so the book comes back
/// if the app is reinstalled on this phone while that account survives:
///
///     miracleBooks/{uid}                 v: 2, updatedAt, order: [page ids]
///     miracleBooks/{uid}/pages/{pageId}  data: that page's JSON, updatedAt
///
/// Each install is its own anonymous account — nothing syncs between devices.
///
/// Rules that keep the backup from ever erasing the book:
/// - nothing goes to the cloud until one read from the SERVER has succeeded
///   for this account (a failed or cached read never counts), so an app
///   reinstalled offline can't upload its empty starter page over a saved
///   book; a failed read is simply tried again later;
/// - the two copies are merged page by page (`BookMerge`): the newer page
///   wins, pages only one side has are kept, and an empty book here never
///   replaces one with content;
/// - only the pages that changed are written, ~2 s after the last change;
/// - the first format (the whole book as one string in the top doc's `data`)
///   is still read, and that field is never deleted from here.
@MainActor
final class MiraclesStore: ObservableObject {
    static let shared = MiraclesStore()

    @Published var pages: [MiraclePage]
    @Published var index: Int = 0
    /// Which box is showing its edit controls (redraw / arrows / keep). Tap a
    /// drawing to surface them; tap anywhere else to put them away. Transient
    /// UI state — never persisted.
    @Published var activeBoxID: String?
    /// Boxes with a draw on its way. Kept here rather than in the box's view,
    /// so turning the page can't lose the result or allow a second paid draw.
    @Published private(set) var drawingBoxIDs: Set<String> = []
    /// The last draw error per box, in plain words.
    @Published private(set) var drawErrors: [String: String] = [:]
    /// Paid renders still running (draws and their better/best versions).
    @Published private(set) var rendersInFlight = 0

    private static let updatedKey = "miraclesUpdatedAt"
    private static let fileName = "miraclesBook.json"
    private static let unreadablePrefix = "miraclesBook.unreadable-"
    private let fileURL: URL
    /// When anything in the book last changed.
    private var updatedAt: Date

    // Cloud backup
    private let cloudEnabled = !AppMode.isUITest
    /// Asked for on every use: after a delete clears Firestore's cache, the
    /// old instance is shut down and the next use gets a fresh one.
    private var db: Firestore { Firestore.firestore() }
    /// A delete is talking to the server; nothing else may sync meanwhile.
    private var deleteInFlight = false
    private var started = false
    /// The account a server read has succeeded for. Nothing is pushed for any
    /// other account.
    private var syncedUID: String?
    private var syncing = false
    private var lastSyncAttempt = Date.distantPast
    private var cloudPaused = false
    private var dirtyPageIDs = Set<String>()
    private var topDirty = false
    private var pushTimer: Task<Void, Never>?
    private var pushing = false
    private var pushAgain = false
    private var pushFailures = 0
    private let network = NWPathMonitor()

    private init() {
        let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent(Self.fileName)
        fileURL = url
        let stamp = UserDefaults.standard.double(forKey: Self.updatedKey)
        updatedAt = Date(timeIntervalSince1970: stamp)
        var loaded = Self.readLocal(url)
        // Pages saved before pages carried their own stamp get the book's.
        for i in loaded.indices where loaded[i].updatedAt == 0 {
            loaded[i].updatedAt = stamp
        }
        pages = loaded.isEmpty ? [MiraclePage()] : loaded
        // Land on the last page that has content, not a trailing blank page the
        // user may have turned to — so reopening the book shows your work.
        index = pages.lastIndex(where: { $0.hasContent }) ?? (pages.count - 1)
    }

    private static func readLocal(_ url: URL) -> [MiraclePage] {
        guard let data = try? Data(contentsOf: url) else { return [] }
        do {
            return try JSONDecoder().decode([MiraclePage].self, from: data)
        } catch {
            // Never write over a book we couldn't read: set it aside and start
            // fresh (the first sync then adopts the cloud copy, if there is one).
            let aside = url.deletingLastPathComponent()
                .appendingPathComponent("\(unreadablePrefix)\(Int(Date().timeIntervalSince1970)).json")
            try? FileManager.default.moveItem(at: url, to: aside)
            syncLog.error("the book on this phone could not be read: \(error.localizedDescription, privacy: .public)")
            return []
        }
    }

    var page: MiraclePage { pages[min(max(index, 0), pages.count - 1)] }

    var canTurnForward: Bool { index < pages.count - 1 || page.hasContent }

    func isDrawing(_ boxID: String) -> Bool { drawingBoxIDs.contains(boxID) }

    func drawError(_ boxID: String) -> String? { drawErrors[boxID] }

    // MARK: - Editing

    /// Finds a box on ANY page — a drawing can land after she has turned the page.
    private func locate(_ boxID: String) -> (page: Int, box: Int)? {
        for p in pages.indices {
            if let b = pages[p].boxes.firstIndex(where: { $0.id == boxID }) {
                return (page: p, box: b)
            }
        }
        return nil
    }

    func setText(_ text: String, boxID: String) {
        guard let at = locate(boxID), pages[at.page].boxes[at.box].text != text else { return }
        let hadContent = pages[at.page].hasContent
        pages[at.page].boxes[at.box].text = text
        if drawErrors[boxID] != nil { drawErrors[boxID] = nil }
        stampDateIfFirstContent(at.page, hadContent: hadContent)
        changed(at.page)
    }

    /// The page's date is the day you first WROTE on it, not the day you first
    /// turned to it (a blank page can sit for days). Stamped once, still
    /// editable by tapping the date.
    private func stampDateIfFirstContent(_ p: Int, hadContent: Bool) {
        if !hadContent && pages[p].hasContent {
            pages[p].date = Date()
        }
    }

    /// Edit the current page's date (shown only once the page has content).
    func setDate(_ date: Date) {
        let p = min(max(index, 0), pages.count - 1)
        pages[p].date = date
        changed(p)
    }

    /// Adds a draw's options AFTER every drawing the box already has. Nothing
    /// is ever deleted, so options she hasn't flipped to yet survive a redraw,
    /// and a result that lands while she is flipping truncates nothing. She
    /// lands on the first new option — unless she kept a drawing while this
    /// one was being made; then the kept one stays, and the new ones wait
    /// behind the arrows. Returns false when the box no longer exists.
    @discardableResult
    private func addDrawings(_ urls: [String], boxID: String) -> Bool {
        guard !urls.isEmpty, let at = locate(boxID) else { return false }
        let hadContent = pages[at.page].hasContent
        var box = pages[at.page].boxes[at.box]
        let keptOne = box.selected && box.url != nil
        let firstNew = box.history.count
        box.history.append(contentsOf: urls)
        if !keptOne {
            box.histIndex = firstNew
            box.selected = false
        }
        pages[at.page].boxes[at.box] = box
        stampDateIfFirstContent(at.page, hadContent: hadContent)
        changed(at.page)
        return true
    }

    /// Record that `newURL` is the same concept as `baseURL` rendered one tier
    /// up. `isBest` = the top tier. Keeps the chain fast → better → best sound
    /// no matter which background render finishes first.
    private func addUpgrade(boxID: String, base: String, new newURL: String, isBest: Bool) {
        guard let at = locate(boxID) else { return }
        var box = pages[at.page].boxes[at.box]
        if isBest {
            if let mid = box.upgrades[base] {
                box.upgrades[mid] = newURL          // better already landed: chain off it
            } else {
                box.upgrades[base] = newURL          // best arrived first: temporary direct link
            }
        } else {
            if let existingBest = box.upgrades[base] {
                box.upgrades[base] = newURL          // re-point fast → better…
                box.upgrades[newURL] = existingBest  // …and better → best
            } else {
                box.upgrades[base] = newURL
            }
        }
        pages[at.page].boxes[at.box] = box
        changed(at.page)
    }

    /// Swap the currently-shown drawing for its next-tier version (the ▲ tap).
    func applyUpgrade(boxID: String) {
        guard let at = locate(boxID) else { return }
        var box = pages[at.page].boxes[at.box]
        guard let current = box.url, let next = box.upgrades[current] else { return }
        box.history[box.histIndex] = next
        pages[at.page].boxes[at.box] = box
        changed(at.page)
    }

    /// Keep the shown drawing ("keep this one"), or un-keep it so the arrows
    /// and redraw come back.
    func setSelected(_ selected: Bool, boxID: String) {
        guard let at = locate(boxID) else { return }
        pages[at.page].boxes[at.box].selected = selected
        changed(at.page)
    }

    /// dir -1 = the drawing before, +1 = the one after
    func step(_ dir: Int, boxID: String) {
        guard let at = locate(boxID) else { return }
        var box = pages[at.page].boxes[at.box]
        guard !box.history.isEmpty else { return }
        box.histIndex = min(max(0, box.histIndex + dir), box.history.count - 1)
        pages[at.page].boxes[at.box] = box
        changed(at.page)
    }

    func turnBack() {
        guard index > 0 else { return }
        index -= 1
        activeBoxID = nil
    }

    func turnForward() {
        activeBoxID = nil
        if index < pages.count - 1 { index += 1; return }
        guard page.hasContent else { return }
        pages.append(MiraclePage())
        index = pages.count - 1
        changed(index)
    }

    // MARK: - Drawing

    /// One paid draw for a box. The work belongs to the store, not the box's
    /// view, so a page turn can't lose the result. Wrapped in a background
    /// task so a short switch to another app doesn't lose it either.
    func draw(boxID: String, distill: Bool) {
        guard !AppMode.isUITest else { return }   // tests never spend money
        guard let at = locate(boxID), !drawingBoxIDs.contains(boxID) else { return }
        let text = pages[at.page].boxes[at.box].text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        drawingBoxIDs.insert(boxID)
        rendersInFlight += 1
        if drawErrors[boxID] != nil { drawErrors[boxID] = nil }
        let activity = BackgroundActivity(name: "draw")
        Task {
            do {
                // One draw returns a few concept options on the FAST tier
                // (~10s); the ‹/› arrows let you pick among them.
                let result = try await MiraclesService.shared.illustrate(
                    text: text, boxID: boxID, distill: distill, variants: 3, tier: "fast"
                )
                // Meanwhile, quietly render the primary concept at the higher
                // tiers. When one lands, ▲ appears on that drawing.
                if addDrawings(result.urls, boxID: boxID),
                   let primary = result.options.first, !primary.drawing.isEmpty {
                    launchUpgrades(for: primary, text: text, boxID: boxID)
                }
            } catch {
                drawErrors[boxID] = MiraclesErrors.message(for: error)
            }
            drawingBoxIDs.remove(boxID)
            rendersInFlight -= 1
            activity.end()
        }
    }

    /// Background quality ladder: same concept, better models. Best-effort —
    /// failures are silent (the fast drawing is already on the page).
    private func launchUpgrades(for option: MiraclesService.DrawOption, text: String, boxID: String) {
        for (tier, isBest) in [("better", false), ("best", true)] {
            rendersInFlight += 1
            let activity = BackgroundActivity(name: "draw-\(tier)")
            Task {
                if let up = try? await MiraclesService.shared.illustrate(
                    text: text, boxID: boxID, distill: false, variants: 1,
                    tier: tier, concept: option.drawing
                ), let url = up.urls.first {
                    addUpgrade(boxID: boxID, base: option.url, new: url, isBest: isBest)
                }
                rendersInFlight -= 1
                activity.end()
            }
        }
    }

    // MARK: - Saving

    /// Every change: stamp the page, write the whole book to this phone at
    /// once, and queue that page for the cloud.
    private func changed(_ p: Int) {
        let now = Date()
        pages[p].updatedAt = now.timeIntervalSince1970
        updatedAt = now
        UserDefaults.standard.set(now.timeIntervalSince1970, forKey: Self.updatedKey)
        writeLocal()
        markDirty(pages[p].id)
    }

    private func writeLocal() {
        do {
            let data = try JSONEncoder().encode(pages)
            try data.write(to: fileURL, options: .atomic)
        } catch {
            syncLog.error("could not save the book on this phone: \(error.localizedDescription, privacy: .public)")
        }
    }

    // MARK: - Starting up

    /// Called once per launch by the root view: signs in, then reads the
    /// cloud copy and merges it with this phone's book.
    func start() async {
        guard !started else { return }
        started = true
        DoodleCache.trimSoon()
        if AppMode.isUITest {
            // Deterministic fixture; no auth, no cloud. Consent starts unset
            // every run so the consent sheet can be photographed — and the
            // test can never draw anyway.
            UserDefaults.standard.removeObject(forKey: Keys.aiConsent)
            if pages.first?.hasContent != true { seedForUITests() }
            return
        }
        // Back online after a failed read: try again.
        network.pathUpdateHandler = { [weak self] path in
            guard path.status == .satisfied else { return }
            Task { @MainActor in self?.requestSync(force: true) }
        }
        network.start(queue: DispatchQueue(label: "com.sageryza.miracles.network"))
        if UserDefaults.standard.object(forKey: Keys.deletePending) != nil {
            await resumePendingDelete()   // starts the fresh sync itself once done
            return
        }
        await syncNow()
    }

    func appBecameActive() {
        requestSync(force: true)
        if isSynced, !pushing, !dirtyPageIDs.isEmpty || topDirty { schedulePush(after: 0) }
    }

    /// Leaving the app: send what is waiting now instead of in 2 s.
    func appWentToBackground() {
        guard cloudEnabled, isSynced, !dirtyPageIDs.isEmpty || topDirty else { return }
        pushTimer?.cancel()
        let activity = BackgroundActivity(name: "save-book")
        Task {
            await pushNow()
            activity.end()
        }
    }

    // MARK: - Cloud: reading

    private var isSynced: Bool {
        guard let uid = syncedUID else { return false }
        return Auth.auth().currentUser?.uid == uid
    }

    private func requestSync(force: Bool = false) {
        if cloudEnabled, started, !deleteInFlight,
           UserDefaults.standard.object(forKey: Keys.deletePending) != nil {
            Task { await resumePendingDelete() }
            return
        }
        guard cloudEnabled, started, !cloudPaused, !syncing, !isSynced else { return }
        if !force && Date().timeIntervalSince(lastSyncAttempt) < 15 { return }
        Task { await syncNow() }
    }

    private func syncNow() async {
        guard cloudEnabled, !cloudPaused, !syncing else { return }
        syncing = true
        defer { syncing = false }
        lastSyncAttempt = Date()
        do {
            try await MiraclesService.shared.ensureSignedIn()
        } catch {
            syncLog.notice("sign-in failed, will try again: \(error.localizedDescription, privacy: .public)")
            return
        }
        guard let uid = Auth.auth().currentUser?.uid else { return }
        let remote: RemoteBook
        do {
            remote = try await readRemote(uid: uid)
        } catch {
            // Offline, captive wifi, slow… Nothing is pushed; we read again
            // on the next change, when the connection comes back, or on return.
            syncLog.notice("cloud read failed, will try again: \(error.localizedDescription, privacy: .public)")
            return
        }
        // The account may have changed while we waited (a delete signs in fresh).
        guard !cloudPaused, Auth.auth().currentUser?.uid == uid else { return }
        apply(remote, uid: uid)
    }

    private struct RemoteBook {
        var pages: [MiraclePage] = []      // in the cloud's order
        var order: [String] = []
        var isV2 = false
        var storedPageIDs = Set<String>()  // pages that already have a doc of their own
    }

    /// Reads the cloud copy from the SERVER only — never from Firestore's cache.
    private func readRemote(uid: String) async throws -> RemoteBook {
        let top = db.collection("miracleBooks").document(uid)
        let snap = try await top.getDocument(source: .server)
        // The page docs count whatever the top doc says: a save that got its
        // pages in but not the top doc still left those pages in the cloud.
        let docs = try await top.collection("pages").getDocuments(source: .server)
        var pageDocs: [MiraclePage] = []
        for doc in docs.documents {
            guard let json = doc.get("data") as? String,
                  var page = try? JSONDecoder().decode(MiraclePage.self, from: Data(json.utf8)) else {
                syncLog.error("cloud page \(doc.documentID, privacy: .public) could not be read")
                continue
            }
            if let t = doc.get("updatedAt") as? NSNumber { page.updatedAt = t.doubleValue }
            pageDocs.append(page)
        }

        var book = RemoteBook()
        book.storedPageIDs = Set(pageDocs.map(\.id))
        var firstFormat: [MiraclePage] = []
        if snap.exists, let v = snap.get("v") as? NSNumber, v.intValue >= 2 {
            book.isV2 = true
            book.order = snap.get("order") as? [String] ?? []
        } else if snap.exists, let json = snap.get("data") as? String {
            // The first format: the whole book as one JSON string in `data`,
            // every page stamped with the doc's updatedAt.
            let stamp = (snap.get("updatedAt") as? NSNumber)?.doubleValue ?? 0
            do {
                firstFormat = try JSONDecoder().decode([MiraclePage].self, from: Data(json.utf8))
            } catch {
                syncLog.error("the old cloud book could not be read: \(error.localizedDescription, privacy: .public)")
            }
            for i in firstFormat.indices { firstFormat[i].updatedAt = stamp }
            book.order = firstFormat.map(\.id)
        }
        book.pages = BookMerge.cloudBook(pageDocs: pageDocs, firstFormat: firstFormat, order: book.order)
        return book
    }

    private func apply(_ remote: RemoteBook, uid: String) {
        let merged = BookMerge.merge(local: pages, remote: remote.pages)
        if !merged.pages.isEmpty, merged.pages != pages {
            let hadContent = pages.contains(where: { $0.hasContent })
            let currentID = page.id
            pages = merged.pages
            if hadContent, let i = pages.firstIndex(where: { $0.id == currentID }) {
                index = i
            } else {
                index = pages.lastIndex(where: { $0.hasContent }) ?? (pages.count - 1)
            }
            activeBoxID = nil
            if let newest = pages.map(\.updatedAt).max(), newest > updatedAt.timeIntervalSince1970 {
                updatedAt = Date(timeIntervalSince1970: newest)
                UserDefaults.standard.set(newest, forKey: Self.updatedKey)
            }
            writeLocal()
        }
        syncedUID = uid
        pushFailures = 0

        let hasContent = pages.contains(where: { $0.hasContent })
        var push = merged.push.union(dirtyPageIDs)
        if hasContent && !remote.isV2 {
            // First save in this format: every page that has no doc of its own yet.
            push.formUnion(pages.map(\.id).filter { !remote.storedPageIDs.contains($0) })
        }
        dirtyPageIDs = push.intersection(Set(pages.map(\.id)))
        topDirty = hasContent && (!remote.isV2 || remote.order != pages.map(\.id))
        if !dirtyPageIDs.isEmpty || topDirty { schedulePush(after: 0) }
    }

    // MARK: - Cloud: writing

    private func markDirty(_ pageID: String) {
        guard cloudEnabled else { return }
        dirtyPageIDs.insert(pageID)
        if isSynced {
            schedulePush(after: 2)
        } else {
            requestSync()   // read first; the merge then sends this page
        }
    }

    private func schedulePush(after seconds: Double) {
        guard cloudEnabled else { return }
        pushTimer?.cancel()
        pushTimer = Task { [weak self] in
            if seconds > 0 {
                try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            }
            if Task.isCancelled { return }
            // Its own task, so a later change cancelling this timer can't
            // touch a save that is already on its way.
            Task { await self?.pushNow() }
        }
    }

    private func pushNow() async {
        guard cloudEnabled, !cloudPaused else { return }
        guard let uid = syncedUID, Auth.auth().currentUser?.uid == uid else {
            requestSync()
            return
        }
        if pushing { pushAgain = true; return }
        let ids = dirtyPageIDs
        guard !ids.isEmpty || topDirty else { return }
        let toWrite = pages.filter { ids.contains($0.id) }
        let order = pages.map(\.id)
        let stamp = updatedAt.timeIntervalSince1970
        dirtyPageIDs = []
        topDirty = false
        pushing = true
        let ok = await write(toWrite, order: order, updatedAt: stamp, uid: uid)
        pushing = false
        if ok {
            pushFailures = 0
        } else {
            dirtyPageIDs.formUnion(ids)
            topDirty = true
            pushFailures += 1
        }
        let more = pushAgain || !dirtyPageIDs.isEmpty || topDirty
        pushAgain = false
        guard more, !cloudPaused else { return }
        let wait = ok ? 0.5 : min(300, 15 * pow(2, Double(min(pushFailures, 5) - 1)))
        schedulePush(after: wait)
    }

    /// Writes the changed pages (in batches well under Firestore's limits),
    /// then the top doc on its own. A failed page write is logged and the pages
    /// stay queued. A failed top-doc write is only logged: the pages are safe
    /// either way, and a book still carrying the first format's large `data`
    /// field (never deleted from here) may be too big for the top doc to grow.
    private func write(_ toWrite: [MiraclePage], order: [String], updatedAt stamp: Double, uid: String) async -> Bool {
        let top = db.collection("miracleBooks").document(uid)
        let encoder = JSONEncoder()
        var batches: [WriteBatch] = []
        var batch: WriteBatch?
        var count = 0
        var bytes = 0
        for page in toWrite {
            guard let data = try? encoder.encode(page), let json = String(data: data, encoding: .utf8) else {
                continue
            }
            if batch == nil || count >= 400 || bytes + data.count > 4_000_000 {
                if let full = batch { batches.append(full) }
                batch = db.batch()
                count = 0
                bytes = 0
            }
            batch?.setData(["data": json, "updatedAt": page.updatedAt],
                           forDocument: top.collection("pages").document(page.id))
            count += 1
            bytes += data.count
        }
        if let last = batch { batches.append(last) }
        do {
            for b in batches { try await b.commit() }
        } catch {
            syncLog.error("cloud save failed: \(error.localizedDescription, privacy: .public)")
            return false
        }
        do {
            // merge: true keeps the first format's `data` field.
            try await top.setData(["v": 2, "updatedAt": stamp, "order": order], merge: true)
        } catch {
            syncLog.error("cloud book order not saved: \(error.localizedDescription, privacy: .public)")
        }
        return true
    }

    // MARK: - Delete everything

    /// Settings → "Delete my book and data". The server deletes the cloud
    /// copy, every drawing in Storage and the account; only when it says ok is
    /// anything deleted here. Then this phone forgets the book, the drawings
    /// and the consent, and a fresh anonymous account starts an empty book.
    func deleteEverything() async throws {
        if AppMode.isUITest {   // tests never touch the cloud
            forgetEverythingOnThisPhone()
            return
        }
        // No connection: say so now rather than after the waits below.
        if network.currentPath.status == .unsatisfied {
            throw URLError(.notConnectedToInternet)
        }
        guard !deleteInFlight else { return }
        deleteInFlight = true
        defer { deleteInFlight = false }
        // Switching away mid-delete must not stop it halfway.
        let activity = BackgroundActivity(name: "delete-book")
        defer { activity.end() }
        cloudPaused = true
        pushTimer?.cancel()
        // Let a save already on its way finish, so nothing lands after the delete.
        await waitWhilePushing(upTo: 10)
        await waitForPendingWrites(upTo: 5)
        // From here on, an app stopped mid-delete finishes it on the next launch.
        UserDefaults.standard.set(true, forKey: Keys.deletePending)
        do {
            try await MiraclesService.shared.deleteMyData()
        } catch {
            UserDefaults.standard.removeObject(forKey: Keys.deletePending)
            cloudPaused = false
            if isSynced, !dirtyPageIDs.isEmpty || topDirty { schedulePush(after: 2) }
            throw error
        }
        await finishDelete()
    }

    /// The app was stopped while a delete was under way. Ask the server again
    /// (it is safe to ask twice) before anything is read or saved, so a book
    /// she deleted can't be saved back to the cloud. If the account is already
    /// gone, the server had finished. Offline: stay paused and try again on the
    /// next change, when the connection returns or when the app comes back.
    private func resumePendingDelete() async {
        guard !deleteInFlight else { return }
        deleteInFlight = true
        defer { deleteInFlight = false }
        let activity = BackgroundActivity(name: "delete-book")
        defer { activity.end() }
        cloudPaused = true
        pushTimer?.cancel()
        do {
            try await MiraclesService.shared.deleteMyData()
        } catch {
            guard Self.accountIsGone(error) else {
                syncLog.notice("finishing a delete failed, will try again: \(error.localizedDescription, privacy: .public)")
                return
            }
        }
        await finishDelete()
    }

    /// The server deleted the account (the last thing it deletes), so the
    /// cached sign-in no longer works.
    private static func accountIsGone(_ error: Error) -> Bool {
        let e = error as NSError
        // The server found no signed-in account ("Sign in first.").
        if e.domain == FunctionsErrorDomain, e.code == FunctionsErrorCode.unauthenticated.rawValue { return true }
        // Auth refusing the cached sign-in: user disabled (17005), not found
        // (17011), invalid token (17017), token expired (17021).
        return e.domain == "FIRAuthErrorDomain" && [17005, 17011, 17017, 17021].contains(e.code)
    }

    /// The server says the book, its drawings and the account are gone: now
    /// this phone forgets them too, and a fresh account starts an empty book.
    private func finishDelete() async {
        forgetEverythingOnThisPhone()
        syncedUID = nil
        await clearCachesOnThisPhone()
        UserDefaults.standard.removeObject(forKey: Keys.deletePending)
        do {
            try Auth.auth().signOut()
        } catch {
            // Stay paused for the rest of this launch: nothing may be written
            // under the deleted account. The next launch starts clean.
            syncLog.error("sign-out after delete failed: \(error.localizedDescription, privacy: .public)")
            return
        }
        cloudPaused = false
        Task { await syncNow() }   // signs in fresh: a new account with an empty book
    }

    /// Firestore keeps a copy of everything it read and wrote on disk, and the
    /// system keeps downloaded drawings: both are emptied, so "deletes every
    /// page and drawing on this phone" stays true. Shutting Firestore down
    /// also drops any save still queued for the deleted account.
    private func clearCachesOnThisPhone() async {
        let firestore = Firestore.firestore()
        do {
            try await firestore.terminate()
            try await firestore.clearPersistence()
        } catch {
            syncLog.error("clearing Firestore's copy failed: \(error.localizedDescription, privacy: .public)")
        }
        URLCache.shared.removeAllCachedResponses()
    }

    private func forgetEverythingOnThisPhone() {
        pages = [MiraclePage()]
        index = 0
        activeBoxID = nil
        drawingBoxIDs = []
        drawErrors = [:]
        dirtyPageIDs = []
        topDirty = false
        pushFailures = 0
        updatedAt = Date(timeIntervalSince1970: 0)
        UserDefaults.standard.removeObject(forKey: Self.updatedKey)
        UserDefaults.standard.removeObject(forKey: Keys.aiConsent)
        writeLocal()
        let fm = FileManager.default
        let folder = fileURL.deletingLastPathComponent()
        if let names = try? fm.contentsOfDirectory(atPath: folder.path) {
            for name in names where name.hasPrefix(Self.unreadablePrefix) {
                try? fm.removeItem(at: folder.appendingPathComponent(name))
            }
        }
        DoodleCache.clearAll()
    }

    private func waitWhilePushing(upTo seconds: Double) async {
        let deadline = Date().addingTimeInterval(seconds)
        while pushing && Date() < deadline {
            try? await Task.sleep(nanoseconds: 200_000_000)
        }
    }

    private func waitForPendingWrites(upTo seconds: Double) async {
        let firestore = db
        await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
            let once = OneShot { done.resume() }
            firestore.waitForPendingWrites { _ in once.fire() }
            DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { once.fire() }
        }
    }

    // MARK: - UI tests

    /// UI-test fixture: one page with four real (permanent) drawings and long
    /// captions, written to the normal local file so a relaunch exercises the
    /// same load path as a real session. Deterministic — no cloud, no cover.
    func seedForUITests() {
        let urls = [
            "https://firebasestorage.googleapis.com/v0/b/membry-df528.firebasestorage.app/o/sagediagram%2Fapril_special_stickers_004.webp?alt=media&token=c8a53079-c8bd-4e86-8cbc-af43a314e90e",
            "https://firebasestorage.googleapis.com/v0/b/membry-df528.firebasestorage.app/o/sagediagram%2Fapril_special_stickers_006.webp?alt=media&token=2f04ac71-a4cf-455f-a972-2ac7f6c91f8f",
            "https://firebasestorage.googleapis.com/v0/b/membry-df528.firebasestorage.app/o/sagediagram%2Fapril_special_stickers_007.webp?alt=media&token=e1aa98fc-74d0-40f5-9f49-51aeb1596778",
            "https://firebasestorage.googleapis.com/v0/b/membry-df528.firebasestorage.app/o/sagediagram%2Fapril_special_stickers_008.webp?alt=media&token=b5244104-dfda-440a-bba7-e691be77734f",
        ]
        var page = MiraclePage()
        page.boxes = urls.enumerated().map { i, u in
            var box = MiracleBox(text: "this really pretty girl was waiting on the sidewalk and gave me flowers (\(i + 1))")
            box.history = [u]
            box.histIndex = 0
            return box
        }
        page.updatedAt = Date().timeIntervalSince1970
        pages = [page]
        index = 0
        writeLocal()
    }
}
