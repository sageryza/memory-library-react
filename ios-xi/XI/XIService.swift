import Foundation
import UIKit
import FirebaseCore
import FirebaseAuth
import FirebaseFirestore
import FirebaseFunctions
import GoogleSignIn

/// A saved XI memory (mirrors the shared `users/{uid}/memories` schema).
struct XIMemory: Identifiable {
    let id: String
    let content: String
    let title: String
    let pairKey: String
    let eventId: String
    let twistId: String
    let eventCap: String
    let twistCap: String
    let hashtags: [String]
    let mode: String          // "board" or "versus"
    let dateTime: String      // short display date, e.g. "6/28/26"
    let timestamp: String     // ISO8601, used for sorting
    var additionalContext: String = ""
    /// Non-empty only for Commons memories — the friend who wrote it. Your own
    /// memories leave this blank.
    var authorName: String = ""
    /// "public" once shared to the others feed (via the AI screen); else private.
    var visibility: String = "private"
    var isCommons: Bool { !authorName.isEmpty }
    var isPublic: Bool { visibility == "public" }
}

/// A saved board arrangement — the placed memories, their positions, the
/// hand-drawn connections, and concept pins — that can be reloaded onto the board.
struct XIConstellation: Identifiable {
    let id: String
    var name: String
    var placed: [String]
    var positions: [String: CGPoint]
    var connections: [(String, String, String)]
    var pins: [(id: String, text: String, x: Double, y: Double)]
}

/// Publishes the current Firebase auth user so the UI can gate sign-in.
@MainActor
final class AuthState: ObservableObject {
    @Published var user: User?
    private var handle: AuthStateDidChangeListenerHandle?

    init() {
        user = Auth.auth().currentUser
        handle = Auth.auth().addStateDidChangeListener { [weak self] _, u in
            Task { @MainActor in self?.user = u }
        }
    }

    var signedIn: Bool { user != nil }
    var isAnonymous: Bool { user?.isAnonymous ?? false }
    var email: String? { user?.email }
    var uid: String? { user?.uid }
}

/// Auth + reading/writing XI memories in the shared `users/{uid}/memories`
/// archive, using the exact same schema as the web app.
@MainActor
final class XIService {
    static let shared = XIService()
    private lazy var db = Firestore.firestore()

    // MARK: Auth

    func signIn(email: String, password: String) async throws {
        try await Auth.auth().signIn(withEmail: email, password: password)
    }

    func playAnonymously() async throws {
        if Auth.auth().currentUser == nil {
            try await Auth.auth().signInAnonymously()
        }
    }

    /// Sign in with Google (same provider as the web). If the user was playing
    /// anonymously, their in-app memories are carried over: we first try to
    /// upgrade the anonymous account in place (same uid → everything preserved);
    /// if the Google account already exists, we copy the anonymous data into it.
    /// Must run on the main actor (presents UI).
    func signInWithGoogle(presenting: UIViewController) async throws {
        guard let clientID = FirebaseApp.app()?.options.clientID else {
            throw NSError(domain: "XI", code: -2,
                          userInfo: [NSLocalizedDescriptionKey: "Missing Google client ID."])
        }
        GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
        let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presenting)
        guard let idToken = result.user.idToken?.tokenString else {
            throw NSError(domain: "XI", code: -3,
                          userInfo: [NSLocalizedDescriptionKey: "Google sign-in returned no ID token."])
        }
        let credential = GoogleAuthProvider.credential(
            withIDToken: idToken, accessToken: result.user.accessToken.tokenString)

        if let current = Auth.auth().currentUser, current.isAnonymous {
            do {
                // New account: upgrade the anon user in place — same uid, so all
                // memories/libraries/board data carry over with no copying.
                try await current.link(with: credential)
                return
            } catch let e as NSError where e.code == AuthErrorCode.credentialAlreadyInUse.rawValue {
                // The Google account already exists. Snapshot the anon data while
                // we can still read it, switch to the real account, then merge in.
                let export = await exportCurrentUserData()
                let cred = (e.userInfo[AuthErrorUserInfoUpdatedCredentialKey] as? AuthCredential) ?? credential
                try await Auth.auth().signIn(with: cred)
                await importData(export)
                return
            }
        }
        try await Auth.auth().signIn(with: credential)
    }

    // MARK: anonymous → account migration

    /// A snapshot of one account's XI data, used to carry an anonymous user's
    /// work into their real account on sign-in.
    struct AccountExport {
        var memories: [(String, [String: Any])] = []
        var libraries: [(String, [String: Any])] = []
        var connectionPairs: [[String: String]] = []
        var positions: [String: [String: Double]] = [:]
    }

    /// Read everything under the currently-signed-in user (raw documents).
    func exportCurrentUserData() async -> AccountExport {
        guard let uid = Auth.auth().currentUser?.uid else { return AccountExport() }
        let root = db.collection("users").document(uid)
        var out = AccountExport()
        if let snap = try? await root.collection("memories").getDocuments() {
            out.memories = snap.documents.map { ($0.documentID, $0.data()) }
        }
        if let snap = try? await root.collection("libraries").getDocuments() {
            out.libraries = snap.documents.map { ($0.documentID, $0.data()) }
        }
        if let c = try? await root.collection("xiBoard").document("connections").getDocument(),
           let pairs = c.data()?["pairs"] as? [[String: String]] {
            out.connectionPairs = pairs
        }
        if let p = try? await root.collection("xiBoard").document("positions").getDocument(),
           let pins = p.data()?["pins"] as? [String: [String: Double]] {
            out.positions = pins
        }
        return out
    }

    /// Merge an export into the currently-signed-in account. Memories and
    /// libraries keep their original doc IDs (so connections/positions still
    /// line up); board connections and positions are unioned with any the
    /// account already has, never clobbered.
    func importData(_ e: AccountExport) async {
        guard let uid = Auth.auth().currentUser?.uid else { return }
        let root = db.collection("users").document(uid)

        for (id, data) in e.memories {
            try? await root.collection("memories").document(id).setData(data, merge: true)
        }
        for (id, data) in e.libraries {
            try? await root.collection("libraries").document(id).setData(data, merge: true)
        }

        if !e.connectionPairs.isEmpty {
            let ref = root.collection("xiBoard").document("connections")
            let snap = try? await ref.getDocument()
            var pairs = (snap?.data()?["pairs"] as? [[String: String]]) ?? []
            func key(_ d: [String: String]) -> String? {
                guard let a = d["a"], let b = d["b"] else { return nil }
                return a < b ? a + "|" + b : b + "|" + a
            }
            var seen = Set(pairs.compactMap(key))
            for d in e.connectionPairs {
                guard let k = key(d), !seen.contains(k) else { continue }
                pairs.append(d); seen.insert(k)
            }
            try? await ref.setData(["pairs": pairs, "updatedAt": FieldValue.serverTimestamp()])
        }

        if !e.positions.isEmpty {
            let ref = root.collection("xiBoard").document("positions")
            let snap = try? await ref.getDocument()
            var pins = (snap?.data()?["pins"] as? [String: [String: Double]]) ?? [:]
            for (id, p) in e.positions where pins[id] == nil { pins[id] = p }
            try? await ref.setData(["pins": pins, "updatedAt": FieldValue.serverTimestamp()])
        }
    }

    func signOut() throws { try Auth.auth().signOut() }

    /// Permanently delete the signed-in account and all of its data — every
    /// document under `users/{uid}`, then the Firebase auth user itself.
    /// Required by App Store guideline 5.1.1(v). If the login is too old,
    /// Firebase demands a recent re-auth; we surface that as a plain-language
    /// ask to sign in again rather than a raw error.
    func deleteAccount() async throws {
        guard let user = Auth.auth().currentUser else {
            throw NSError(domain: "XI", code: -1,
                          userInfo: [NSLocalizedDescriptionKey: "Not signed in."])
        }
        let root = db.collection("users").document(user.uid)
        for sub in ["memories", "libraries", "xiBoard"] {
            if let snap = try? await root.collection(sub).getDocuments() {
                for doc in snap.documents { try? await doc.reference.delete() }
            }
        }
        try? await root.delete()
        do {
            try await user.delete()
        } catch let e as NSError where e.code == AuthErrorCode.requiresRecentLogin.rawValue {
            throw NSError(domain: "XI", code: -10, userInfo: [NSLocalizedDescriptionKey:
                "For your security, please sign out, sign in again, then delete your account."])
        }
    }

    // MARK: Save

    /// Saves a memory; returns its document id. When `share` is true the memory
    /// is also submitted to the public "others" feed — in the background,
    /// through the publishMemory Cloud Function's AI safety screen.
    @discardableResult
    func saveMemory(event: XICard, twist: XICard, text: String, boardDay: Int,
                    mode: String = "board", share: Bool = false) async throws -> String {
        guard let uid = Auth.auth().currentUser?.uid else {
            throw NSError(domain: "XI", code: -1, userInfo: [NSLocalizedDescriptionKey: "Not signed in."])
        }
        let evCap = event.cap, twCap = twist.cap
        let title = "I \(evCap.lowercased()), \(twCap.lowercased())"
        let tags = [slugTag(evCap), slugTag(twCap)].compactMap { $0 }

        let now = Date()
        let iso = ISO8601DateFormatter(); iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let df = DateFormatter(); df.dateStyle = .short; df.timeStyle = .none

        let doc: [String: Any] = [
            "content": text.trimmingCharacters(in: .whitespacesAndNewlines),
            "title": title,
            "hashtags": tags,
            "source": "xi",
            "mode": mode,
            "visibility": "private",   // publishMemory flips it after screening
            "event": ["id": event.id, "cap": evCap],
            "twist": ["id": twist.id, "cap": twCap],
            "pairKey": "\(event.id)__\(twist.id)",
            "timestamp": iso.string(from: now),
            "dateTime": df.string(from: now),
            "boardDay": boardDay,
            "createdAt": FieldValue.serverTimestamp(),
            "updatedAt": FieldValue.serverTimestamp(),
        ]
        let ref = try await db.collection("users").document(uid)
            .collection("memories").addDocument(data: doc)
        // Replace the card-pair title with an AI title distilled from what the
        // user actually wrote — in the background so saving stays instant. Falls
        // back silently to the "I event, twist" title if AI is unavailable.
        let content = text.trimmingCharacters(in: .whitespacesAndNewlines)
        Task {
            if let ai = await self.generateTitle(from: content) {
                try? await ref.updateData(["title": ai, "updatedAt": FieldValue.serverTimestamp()])
            }
        }
        if share {
            let id = ref.documentID
            Task { await self.setMemoryVisibility(id, isPublic: true) }
        }
        return ref.documentID
    }

    // MARK: Public "others" feed

    /// One real person's shared memory for a card pair.
    struct PublicOther: Identifiable, Equatable {
        let id: String
        let byUid: String
        let byName: String
        let content: String
        let ts: Double
    }

    /// Publish (after the server's AI screen) or unpublish a memory. Returns
    /// true when the final state matches the request — false means the screen
    /// kept it private.
    @discardableResult
    func setMemoryVisibility(_ memoryId: String, isPublic: Bool) async -> Bool {
        do {
            let res = try await functions.httpsCallable("publishMemory")
                .call(["memoryId": memoryId, "visibility": isPublic ? "public" : "private"])
            let ok = (res.data as? [String: Any])?["ok"] as? Bool ?? false
            return ok
        } catch { return false }
    }

    /// Flag a public memory for review (write-only reports collection).
    func reportPublicMemory(_ other: PublicOther, reason: String, details: String) async throws {
        guard let uid = Auth.auth().currentUser?.uid else {
            throw NSError(domain: "XI", code: -1, userInfo: [NSLocalizedDescriptionKey: "Sign in to report."])
        }
        try await db.collection("xiReports").addDocument(data: [
            "kind": "publicMemory",
            "publicId": other.id,
            "reportedUid": other.byUid,
            "reportedName": other.byName,
            "text": other.content,
            "reason": reason,
            "details": details.trimmingCharacters(in: .whitespacesAndNewlines),
            "reporterUid": uid,
            "status": "pending",
            "ts": FieldValue.serverTimestamp(),
        ])
    }

    /// Real shared memories for a pair — everyone's but yours, newest first.
    /// (No orderBy in the query so no composite index is needed.)
    func publicOthers(pairKey: String) async -> [PublicOther] {
        guard !pairKey.isEmpty else { return [] }
        let me = Auth.auth().currentUser?.uid
        let docs = await retryingDocuments(
            db.collection("publicMemories").whereField("pairKey", isEqualTo: pairKey))
        return docs.compactMap { doc -> PublicOther? in
            let d = doc.data()
            let content = d["content"] as? String ?? ""
            guard !content.isEmpty else { return nil }
            let by = d["byUid"] as? String ?? ""
            if let me, by == me { return nil }
            return PublicOther(id: doc.documentID, byUid: by,
                               byName: d["byName"] as? String ?? "anonymous",
                               content: content, ts: d["ts"] as? Double ?? 0)
        }
        .sorted { $0.ts > $1.ts }
    }

    private lazy var functions = Functions.functions()

    /// Ask the shared `aiAssist` Cloud Function (Claude Haiku) for a short,
    /// evocative title based on the memory's text. Returns nil if AI is off /
    /// unreachable, so callers keep their fallback title.
    func generateTitle(from text: String) async -> String? {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard t.count > 3 else { return nil }
        do {
            let res = try await functions.httpsCallable("aiAssist").call(["mode": "title", "text": t])
            guard let data = res.data as? [String: Any],
                  let title = (data["title"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !title.isEmpty else { return nil }
            return title
        } catch {
            return nil
        }
    }

    /// Generate AI (Haiku) titles for the signed-in user's memories that have no
    /// title yet, leaving titled ones untouched. Returns (updated, scanned).
    func backfillTitles() async -> (updated: Int, scanned: Int) {
        guard let uid = Auth.auth().currentUser?.uid else { return (0, 0) }
        let targets = (await allMemories()).filter {
            $0.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                && !$0.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
        var updated = 0
        for m in targets {
            if let ai = await generateTitle(from: m.content) {
                try? await db.collection("users").document(uid).collection("memories").document(m.id)
                    .updateData(["title": ai, "updatedAt": FieldValue.serverTimestamp()])
                updated += 1
            }
        }
        return (updated, targets.count)
    }

    /// Cache of AI-written "others" memories per card pair — persisted to
    /// UserDefaults so the same pair shows the SAME texts instantly, across
    /// launches (they're presented as what other people wrote, so they must
    /// not reshuffle every time the app opens).
    private var othersCache: [String: [String]] = {
        (UserDefaults.standard.dictionary(forKey: "xi.others.v1") as? [String: [String]]) ?? [:]
    }()

    /// Synchronous cache lookup so Today can render others instantly (no
    /// clear-then-refetch flash) when the pair was seen before.
    func cachedOthers(_ pairKey: String) -> [String]? { othersCache[pairKey] }

    private func persistOthersCache() {
        // Keep the store bounded — beyond ~150 pairs drop arbitrary old entries.
        if othersCache.count > 150 {
            for key in othersCache.keys.shuffled().prefix(othersCache.count - 120) {
                othersCache.removeValue(forKey: key)
            }
        }
        UserDefaults.standard.set(othersCache, forKey: "xi.others.v1")
    }

    /// Ask `aiAssist` (Claude Haiku) for a few short memories that genuinely
    /// combine BOTH cards — shown as what other people wrote for this pair.
    /// Returns nil if AI is off / unreachable (callers then show nothing).
    func generateOthers(pairKey: String, eventCap: String, twistCap: String) async -> [String]? {
        if let hit = othersCache[pairKey] { return hit }
        do {
            let res = try await functions.httpsCallable("aiAssist")
                .call(["mode": "others", "event": eventCap, "twist": twistCap, "n": 3])
            guard let data = res.data as? [String: Any],
                  let memories = data["memories"] as? [String], !memories.isEmpty else { return nil }
            othersCache[pairKey] = memories
            persistOthersCache()
            return memories
        } catch {
            return nil
        }
    }

    /// Ask the shared `aiAssist` Cloud Function (Claude Haiku) for a few thematic
    /// hashtags distilled from the memory's text. Returns nil if AI is off /
    /// unreachable (or the `tags` mode isn't deployed yet).
    func generateTags(from text: String) async -> [String]? {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard t.count > 3 else { return nil }
        do {
            let res = try await functions.httpsCallable("aiAssist").call(["mode": "tags", "text": t])
            guard let data = res.data as? [String: Any],
                  let arr = data["tags"] as? [String] else { return nil }
            let tags = arr.map { xiNormTag($0) }.filter { !$0.isEmpty }
            return tags.isEmpty ? nil : tags
        } catch {
            return nil
        }
    }

    /// Create a memory written directly (not from the XI card game): the same
    /// fields the web's Add Memory modal uses — title, content, hashtags, and an
    /// optional bit of extra context.
    @discardableResult
    func addMemory(title: String, content: String, hashtags: [String],
                   additionalContext: String = "") async -> String? {
        guard let uid = Auth.auth().currentUser?.uid else { return nil }
        let now = Date()
        let iso = ISO8601DateFormatter(); iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let df = DateFormatter(); df.dateStyle = .short; df.timeStyle = .none
        let doc: [String: Any] = [
            "content": content.trimmingCharacters(in: .whitespacesAndNewlines),
            "title": title.trimmingCharacters(in: .whitespacesAndNewlines),
            "hashtags": hashtags,
            "additionalContext": additionalContext.trimmingCharacters(in: .whitespacesAndNewlines),
            "source": "manual",
            "mode": "board",
            "timestamp": iso.string(from: now),
            "dateTime": df.string(from: now),
            "createdAt": FieldValue.serverTimestamp(),
            "updatedAt": FieldValue.serverTimestamp(),
        ]
        let ref = try? await db.collection("users").document(uid)
            .collection("memories").addDocument(data: doc)
        // Titling is automatic for ALL memories: if none was typed, an AI title
        // distilled from the text arrives in the background — same as memories
        // saved from the games. A typed title is never overwritten.
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedContent = content.trimmingCharacters(in: .whitespacesAndNewlines)
        if let ref, trimmedTitle.isEmpty, !trimmedContent.isEmpty {
            Task {
                if let ai = await self.generateTitle(from: trimmedContent) {
                    try? await ref.updateData(["title": ai, "updatedAt": FieldValue.serverTimestamp()])
                }
            }
        }
        return ref?.documentID
    }

    /// Edit an existing memory's user-facing fields.
    func updateMemory(_ id: String, title: String, content: String,
                      hashtags: [String], additionalContext: String = "") async {
        guard let uid = Auth.auth().currentUser?.uid else { return }
        let ref = db.collection("users").document(uid).collection("memories").document(id)
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedContent = content.trimmingCharacters(in: .whitespacesAndNewlines)
        try? await ref.updateData([
            "title": trimmedTitle,
            "content": trimmedContent,
            "hashtags": hashtags,
            "additionalContext": additionalContext.trimmingCharacters(in: .whitespacesAndNewlines),
            "updatedAt": FieldValue.serverTimestamp(),
        ])
        // Saved without a title → an AI one arrives in the background (a typed
        // title is never overwritten).
        if trimmedTitle.isEmpty, !trimmedContent.isEmpty {
            Task {
                if let ai = await self.generateTitle(from: trimmedContent) {
                    try? await ref.updateData(["title": ai, "updatedAt": FieldValue.serverTimestamp()])
                }
            }
        }
    }

    /// Soft-delete a memory (moves it to trash — matches the web's `deletedAt`).
    func trashMemory(_ id: String) async {
        guard let uid = Auth.auth().currentUser?.uid else { return }
        try? await db.collection("users").document(uid).collection("memories").document(id)
            .updateData(["deletedAt": FieldValue.serverTimestamp(),
                         "updatedAt": FieldValue.serverTimestamp()])
    }

    /// The trashed (soft-deleted) memories — those carrying a `deletedAt`.
    func trashedMemories() async -> [XIMemory] {
        guard let uid = Auth.auth().currentUser?.uid else { return [] }
        let docs = await retryingDocuments(
            db.collection("users").document(uid).collection("memories"))
            .filter { doc in
                let dv = doc.data()["deletedAt"]
                return dv != nil && !(dv is NSNull)
            }
        return docs.compactMap(parse).sorted { $0.timestamp > $1.timestamp }
    }

    /// Restore a trashed memory (clears `deletedAt`).
    func restoreMemory(_ id: String) async {
        guard let uid = Auth.auth().currentUser?.uid else { return }
        try? await db.collection("users").document(uid).collection("memories").document(id)
            .updateData(["deletedAt": FieldValue.delete(),
                         "updatedAt": FieldValue.serverTimestamp()])
    }

    // MARK: Read

    /// One dropped request must not render as a false "No memories yet" — the
    /// same one-shot-no-retry disease the card art had. Reads go through this:
    /// retry with backoff before conceding an empty result.
    private func retryingDocuments(_ query: Query, attempts: Int = 3) async -> [QueryDocumentSnapshot] {
        for attempt in 1...attempts {
            if let snap = try? await query.getDocuments() { return snap.documents }
            if attempt < attempts {
                try? await Task.sleep(nanoseconds: UInt64(attempt) * 700_000_000)
            }
        }
        return []
    }

    func memories(pairKey: String) async -> [XIMemory] {
        guard let uid = Auth.auth().currentUser?.uid else { return [] }
        let docs = await retryingDocuments(
            db.collection("users").document(uid).collection("memories")
                .whereField("pairKey", isEqualTo: pairKey))
        return docs.compactMap(parse).sorted { $0.timestamp > $1.timestamp }
    }

    /// Every memory in the user's library (not just XI-game ones), minus trash —
    /// mirrors the web archive, which shows all non-deleted memories regardless
    /// of `source`. Web memories have no `source` field, so we must not filter by
    /// it; soft-deleted memories carry a `deletedAt` and are excluded.
    func allMemories() async -> [XIMemory] {
        guard let uid = Auth.auth().currentUser?.uid else { return [] }
        let docs = await retryingDocuments(
            db.collection("users").document(uid).collection("memories"))
            .filter { doc in
                let dv = doc.data()["deletedAt"]
                return dv == nil || dv is NSNull      // keep active (and restored) only
            }
        return docs.compactMap(parse).sorted { $0.timestamp > $1.timestamp }
    }

    private let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f
    }()
    private let shortDateFormatter: DateFormatter = {
        let f = DateFormatter(); f.dateStyle = .short; f.timeStyle = .none; return f
    }()

    private func parse(_ doc: QueryDocumentSnapshot) -> XIMemory? {
        let d = doc.data()
        let content = d["content"] as? String ?? ""
        let title = d["title"] as? String ?? ""
        if content.isEmpty && title.isEmpty { return nil }   // skip empty shells
        let ev = d["event"] as? [String: Any]
        let tw = d["twist"] as? [String: Any]
        // Web memories sort/date by createdAt; XI memories carry timestamp/dateTime.
        let created = d["createdAt"] as? Timestamp
        let ts = d["timestamp"] as? String ?? ""
        let timestamp = !ts.isEmpty ? ts : (created.map { isoFormatter.string(from: $0.dateValue()) } ?? "")
        let dt = d["dateTime"] as? String ?? (created.map { shortDateFormatter.string(from: $0.dateValue()) } ?? "")
        return XIMemory(
            id: doc.documentID,
            content: content,
            title: title,
            pairKey: d["pairKey"] as? String ?? "",
            eventId: ev?["id"] as? String ?? "",
            twistId: tw?["id"] as? String ?? "",
            eventCap: ev?["cap"] as? String ?? "",
            twistCap: tw?["cap"] as? String ?? "",
            hashtags: (d["hashtags"] as? [String]) ?? [],
            mode: d["mode"] as? String ?? "board",
            dateTime: dt,
            timestamp: timestamp,
            additionalContext: d["additionalContext"] as? String ?? "",
            authorName: d["authorName"] as? String ?? "",
            visibility: d["visibility"] as? String ?? "private"
        )
    }

    // MARK: The Commons — friends' memories brought in from Versus games and
    // shared boards. A separate collection so they never mix into the archive;
    // only real people you play or share with land here (never robots/strangers).

    /// Every memory in the user's Commons, newest first.
    func commonsMemories() async -> [XIMemory] {
        guard let uid = Auth.auth().currentUser?.uid else { return [] }
        let docs = await retryingDocuments(
            db.collection("users").document(uid).collection("commons"))
        return docs.compactMap(parse).sorted { $0.timestamp > $1.timestamp }
    }

    /// Add a friend's memory to the Commons. De-dupes on (author + content) so
    /// replaying a game or re-importing a board never piles up duplicates.
    /// Returns true if a new memory was actually written.
    @discardableResult
    func addToCommons(title: String, content: String, hashtags: [String],
                      authorName: String, sourceType: String, sourceId: String) async -> Bool {
        (await addToCommonsReturningId(title: title, content: content, hashtags: hashtags,
                                       authorName: authorName, sourceType: sourceType,
                                       sourceId: sourceId))?.isNew ?? false
    }

    /// Same as addToCommons, but also returns the Commons doc id — the existing
    /// doc's on a de-dupe hit — so an imported board can place the memory.
    func addToCommonsReturningId(title: String, content: String, hashtags: [String],
                                 authorName: String, sourceType: String,
                                 sourceId: String) async -> (id: String, isNew: Bool)? {
        guard let uid = Auth.auth().currentUser?.uid else { return nil }
        let c = content.trimmingCharacters(in: .whitespacesAndNewlines)
        let t = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let author = authorName.trimmingCharacters(in: .whitespacesAndNewlines)
        if c.isEmpty && t.isEmpty { return nil }
        let col = db.collection("users").document(uid).collection("commons")
        // De-dupe: same author + same content already in the Commons.
        if let dupe = try? await col.whereField("content", isEqualTo: c).getDocuments(),
           let hit = dupe.documents.first(where: { ($0.data()["authorName"] as? String ?? "") == author }) {
            return (hit.documentID, false)
        }
        let now = Date()
        let doc: [String: Any] = [
            "title": t, "content": c, "hashtags": hashtags,
            "authorName": author.isEmpty ? "A friend" : author,
            "sourceType": sourceType, "sourceId": sourceId,
            "source": "commons",
            "mode": sourceType == "versus" ? "versus" : "board",
            "timestamp": isoFormatter.string(from: now),
            "dateTime": shortDateFormatter.string(from: now),
            "createdAt": FieldValue.serverTimestamp(),
            "updatedAt": FieldValue.serverTimestamp(),
        ]
        guard let ref = try? await col.addDocument(data: doc) else { return nil }
        return (ref.documentID, true)
    }

    /// Remove a memory from the Commons (hard delete — it isn't yours to trash).
    func removeFromCommons(_ id: String) async {
        guard let uid = Auth.auth().currentUser?.uid else { return }
        try? await db.collection("users").document(uid)
            .collection("commons").document(id).delete()
    }

    // MARK: Constellation connections (manual strings between cards)

    /// Loads the user's hand-drawn connections from
    /// `users/{uid}/xiBoard/connections` (stored as an array of {a,b} maps —
    /// Firestore can't nest plain arrays).
    func loadConnections() async -> [(String, String, String)] {
        guard let uid = Auth.auth().currentUser?.uid else { return [] }
        let snap = try? await db.collection("users").document(uid)
            .collection("xiBoard").document("connections").getDocument()
        let arr = (snap?.data()?["pairs"] as? [[String: String]]) ?? []
        return arr.compactMap { d in
            guard let a = d["a"], let b = d["b"] else { return nil }
            return (a, b, d["insight"] ?? "")
        }
    }

    /// Persists the full set of hand-drawn connections (overwrites). Each is an
    /// {a, b, insight} map.
    func saveConnections(_ conns: [(String, String, String)]) async {
        guard let uid = Auth.auth().currentUser?.uid else { return }
        let arr = conns.map { ["a": $0.0, "b": $0.1, "insight": $0.2] }
        try? await db.collection("users").document(uid)
            .collection("xiBoard").document("connections")
            .setData(["pairs": arr, "updatedAt": FieldValue.serverTimestamp()])
    }

    // MARK: Libraries (smart collections — shared with the web app)

    func loadLibraries() async -> [XILibrary] {
        guard let uid = Auth.auth().currentUser?.uid else { return [] }
        let snap = try? await db.collection("users").document(uid)
            .collection("libraries").getDocuments()
        return (snap?.documents ?? []).map(parseLibrary)
    }

    private func parseLibrary(_ doc: QueryDocumentSnapshot) -> XILibrary {
        let d = doc.data()
        let ids: [String]
        if let s = d["manualMemoryIds"] as? [String] { ids = s }
        else if let a = d["manualMemoryIds"] as? [Any] { ids = a.map { String(describing: $0) } }
        else { ids = [] }
        return XILibrary(
            id: doc.documentID,
            name: d["name"] as? String ?? "Untitled",
            description: d["description"] as? String ?? "",
            colorHex: d["color"] as? String,
            isCore: d["isCore"] as? Bool ?? false,
            isLocked: d["isLocked"] as? Bool ?? false,
            manualMemoryIds: ids,
            searchLogic: XISearchLogic(d["searchLogic"] as? [String: Any])
        )
    }

    @discardableResult
    func createLibrary(name: String, searchLogic: XISearchLogic? = nil,
                       manualMemoryIds: [String] = [], isLocked: Bool = false,
                       colorHex: String? = nil) async -> String? {
        guard let uid = Auth.auth().currentUser?.uid else { return nil }
        let iso = ISO8601DateFormatter()
        var doc: [String: Any] = [
            "name": name,
            "description": "",
            "manualMemoryIds": manualMemoryIds,
            "searchLogic": searchLogic.map { $0.dict } ?? NSNull(),
            "isLocked": isLocked,
            "isCore": false,
            "color": colorHex ?? NSNull(),
            "createdAt": iso.string(from: Date()),
            "userId": uid,
        ]
        if colorHex == nil { doc["color"] = NSNull() }
        let ref = try? await db.collection("users").document(uid)
            .collection("libraries").addDocument(data: doc)
        return ref?.documentID
    }

    func updateLibrary(_ id: String, _ fields: [String: Any]) async {
        guard let uid = Auth.auth().currentUser?.uid else { return }
        try? await db.collection("users").document(uid)
            .collection("libraries").document(id).updateData(fields)
    }

    func deleteLibrary(_ id: String) async {
        guard let uid = Auth.auth().currentUser?.uid else { return }
        try? await db.collection("users").document(uid)
            .collection("libraries").document(id).delete()
    }

    // MARK: Multiple boards (named canvases; one is active at a time)

    struct XIBoardMeta: Identifiable, Equatable {
        let id: String
        let name: String
        let updatedAt: Date
    }

    struct XIBoardData {
        let id: String
        var name: String
        var positions: [String: CGPoint]
        var placed: [String]
        var pins: [(id: String, text: String)]
        var connections: [(String, String, String)]
    }

    private func boardsRef(_ uid: String) -> CollectionReference {
        db.collection("users").document(uid).collection("xiBoards")
    }
    private func activePointerRef(_ uid: String) -> DocumentReference {
        db.collection("users").document(uid).collection("xiBoard").document("active")
    }

    private func decodeBoard(_ id: String, _ d: [String: Any]) -> XIBoardData {
        var positions: [String: CGPoint] = [:]
        for (k, v) in (d["positions"] as? [String: [String: Double]]) ?? [:] {
            if let x = v["x"], let y = v["y"] { positions[k] = CGPoint(x: x, y: y) }
        }
        let pins = ((d["pins"] as? [[String: Any]]) ?? []).compactMap { p -> (id: String, text: String)? in
            guard let pid = p["id"] as? String else { return nil }
            return (pid, p["text"] as? String ?? "")
        }
        let conns = ((d["connections"] as? [[String: Any]]) ?? []).compactMap { c -> (String, String, String)? in
            guard let a = c["a"] as? String, let b = c["b"] as? String else { return nil }
            return (a, b, c["insight"] as? String ?? "")
        }
        return XIBoardData(id: id, name: d["name"] as? String ?? "Untitled board",
                           positions: positions, placed: (d["placed"] as? [String]) ?? [],
                           pins: pins, connections: conns)
    }

    private func encodeBoard(_ b: XIBoardData) -> [String: Any] {
        var pos: [String: [String: Double]] = [:]
        for (k, p) in b.positions { pos[k] = ["x": Double(p.x), "y": Double(p.y)] }
        return [
            "name": b.name,
            "positions": pos,
            "placed": b.placed,
            "pins": b.pins.map { ["id": $0.id, "text": $0.text] },
            "connections": b.connections.map { ["a": $0.0, "b": $0.1, "insight": $0.2] },
            "updatedAt": FieldValue.serverTimestamp(),
        ]
    }

    func listBoards() async -> [XIBoardMeta] {
        guard let uid = Auth.auth().currentUser?.uid else { return [] }
        let docs = await retryingDocuments(boardsRef(uid))
        return docs.map { doc in
            XIBoardMeta(id: doc.documentID,
                        name: doc.data()["name"] as? String ?? "Untitled board",
                        updatedAt: (doc.data()["updatedAt"] as? Timestamp)?.dateValue() ?? .distantPast)
        }
        .sorted { $0.updatedAt > $1.updatedAt }
    }

    /// The board to show on open: the active pointer's board, else the most
    /// recently touched, else the legacy single board migrated into the new
    /// collection, else a fresh empty one.
    func loadActiveBoard() async -> XIBoardData {
        guard let uid = Auth.auth().currentUser?.uid else {
            return XIBoardData(id: "", name: "Untitled board", positions: [:], placed: [], pins: [], connections: [])
        }
        if let pointed = (try? await activePointerRef(uid).getDocument())?.data()?["boardId"] as? String,
           let snap = try? await boardsRef(uid).document(pointed).getDocument(),
           snap.exists, let d = snap.data() {
            return decodeBoard(pointed, d)
        }
        if let newest = await listBoards().first,
           let snap = try? await boardsRef(uid).document(newest.id).getDocument(), let d = snap.data() {
            try? await activePointerRef(uid).setData(["boardId": newest.id])
            return decodeBoard(newest.id, d)
        }
        // Migrate the legacy single board (four loose docs) into the first
        // named board, so nothing anyone arranged is lost.
        async let conns = loadConnections()
        async let pos = loadBoardPositions()
        async let placedIds = loadPlacedIds()
        async let pinData = loadPins()
        let legacy = XIBoardData(id: "", name: "My board",
                                 positions: await pos, placed: await placedIds,
                                 pins: await pinData, connections: await conns)
        let hasContent = !legacy.placed.isEmpty || !legacy.pins.isEmpty
        var board = hasContent ? legacy : XIBoardData(id: "", name: "Untitled board",
                                                      positions: [:], placed: [], pins: [], connections: [])
        let ref = boardsRef(uid).document()
        board = XIBoardData(id: ref.documentID, name: board.name, positions: board.positions,
                            placed: board.placed, pins: board.pins, connections: board.connections)
        try? await ref.setData(encodeBoard(board))
        try? await activePointerRef(uid).setData(["boardId": ref.documentID])
        return board
    }

    func saveBoard(_ board: XIBoardData) async {
        guard let uid = Auth.auth().currentUser?.uid, !board.id.isEmpty else { return }
        try? await boardsRef(uid).document(board.id).setData(encodeBoard(board))
    }

    func createBoard(name: String = "Untitled board") async -> XIBoardData {
        guard let uid = Auth.auth().currentUser?.uid else {
            return XIBoardData(id: "", name: name, positions: [:], placed: [], pins: [], connections: [])
        }
        let ref = boardsRef(uid).document()
        let board = XIBoardData(id: ref.documentID, name: name, positions: [:], placed: [], pins: [], connections: [])
        try? await ref.setData(encodeBoard(board))
        try? await activePointerRef(uid).setData(["boardId": ref.documentID])
        return board
    }

    func switchBoard(to id: String) async -> XIBoardData? {
        guard let uid = Auth.auth().currentUser?.uid,
              let snap = try? await boardsRef(uid).document(id).getDocument(),
              snap.exists, let d = snap.data() else { return nil }
        try? await activePointerRef(uid).setData(["boardId": id])
        return decodeBoard(id, d)
    }

    func renameBoard(_ id: String, to name: String) async {
        guard let uid = Auth.auth().currentUser?.uid else { return }
        try? await boardsRef(uid).document(id)
            .updateData(["name": name, "updatedAt": FieldValue.serverTimestamp()])
    }

    func deleteBoard(_ id: String) async {
        guard let uid = Auth.auth().currentUser?.uid else { return }
        try? await boardsRef(uid).document(id).delete()
    }

    // MARK: Constellation card positions (persist the board arrangement)

    func loadBoardPositions() async -> [String: CGPoint] {
        guard let uid = Auth.auth().currentUser?.uid else { return [:] }
        let snap = try? await db.collection("users").document(uid)
            .collection("xiBoard").document("positions").getDocument()
        let raw = (snap?.data()?["pins"] as? [String: [String: Double]]) ?? [:]
        var out: [String: CGPoint] = [:]
        for (id, p) in raw {
            if let x = p["x"], let y = p["y"] { out[id] = CGPoint(x: x, y: y) }
        }
        return out
    }

    func saveBoardPositions(_ positions: [String: CGPoint]) async {
        guard let uid = Auth.auth().currentUser?.uid else { return }
        var pins: [String: [String: Double]] = [:]
        for (id, p) in positions { pins[id] = ["x": Double(p.x), "y": Double(p.y)] }
        try? await db.collection("users").document(uid)
            .collection("xiBoard").document("positions")
            .setData(["pins": pins, "updatedAt": FieldValue.serverTimestamp()])
    }

    /// Which memories are currently *placed on* the board (the curated subset).
    /// Empty for a fresh board — the user pulls memories in.
    func loadPlacedIds() async -> [String] {
        guard let uid = Auth.auth().currentUser?.uid else { return [] }
        let snap = try? await db.collection("users").document(uid)
            .collection("xiBoard").document("placed").getDocument()
        return (snap?.data()?["ids"] as? [String]) ?? []
    }

    func savePlacedIds(_ ids: [String]) async {
        guard let uid = Auth.auth().currentUser?.uid else { return }
        try? await db.collection("users").document(uid)
            .collection("xiBoard").document("placed")
            .setData(["ids": ids, "updatedAt": FieldValue.serverTimestamp()])
    }

    /// Standalone concept pins (id + label). Their positions live in the shared
    /// positions doc, so only the metadata is stored here.
    func loadPins() async -> [(id: String, text: String)] {
        guard let uid = Auth.auth().currentUser?.uid else { return [] }
        let snap = try? await db.collection("users").document(uid)
            .collection("xiBoard").document("pins").getDocument()
        let arr = (snap?.data()?["pins"] as? [[String: Any]]) ?? []
        return arr.compactMap { d in
            guard let id = d["id"] as? String else { return nil }
            return (id, d["text"] as? String ?? "")
        }
    }

    func savePins(_ pins: [(id: String, text: String)]) async {
        guard let uid = Auth.auth().currentUser?.uid else { return }
        let arr = pins.map { ["id": $0.id, "text": $0.text] }
        try? await db.collection("users").document(uid)
            .collection("xiBoard").document("pins")
            .setData(["pins": arr, "updatedAt": FieldValue.serverTimestamp()])
    }

    // MARK: Saved constellations (named board arrangements you can reload)

    func saveConstellation(name: String, placed: [String], positions: [String: CGPoint],
                           connections: [(String, String, String)],
                           pins: [(id: String, text: String)]) async -> String? {
        guard let uid = Auth.auth().currentUser?.uid else { return nil }
        let onBoard = Set(placed).union(pins.map { $0.id })
        var pos: [String: [String: Double]] = [:]
        for (id, p) in positions where onBoard.contains(id) {
            pos[id] = ["x": Double(p.x), "y": Double(p.y)]
        }
        let conns = connections.map { ["a": $0.0, "b": $0.1, "insight": $0.2] }
        let pinArr: [[String: Any]] = pins.map { p in
            let pt = positions[p.id] ?? .zero
            return ["id": p.id, "text": p.text, "x": Double(pt.x), "y": Double(pt.y)]
        }
        let doc: [String: Any] = [
            "name": name.isEmpty ? "Untitled" : name,
            "placed": placed, "positions": pos, "connections": conns, "pins": pinArr,
            "createdAt": FieldValue.serverTimestamp(),
        ]
        let ref = try? await db.collection("users").document(uid)
            .collection("constellations").addDocument(data: doc)
        return ref?.documentID
    }

    func loadConstellations() async -> [XIConstellation] {
        guard let uid = Auth.auth().currentUser?.uid else { return [] }
        let snap = try? await db.collection("users").document(uid)
            .collection("constellations").getDocuments()
        return (snap?.documents ?? []).map { doc in
            let d = doc.data()
            var pos: [String: CGPoint] = [:]
            for (id, xy) in (d["positions"] as? [String: [String: Double]]) ?? [:] {
                if let x = xy["x"], let y = xy["y"] { pos[id] = CGPoint(x: x, y: y) }
            }
            let conns = ((d["connections"] as? [[String: String]]) ?? []).compactMap { c -> (String, String, String)? in
                guard let a = c["a"], let b = c["b"] else { return nil }
                return (a, b, c["insight"] ?? "")
            }
            let pinArr = ((d["pins"] as? [[String: Any]]) ?? []).compactMap { p -> (id: String, text: String, x: Double, y: Double)? in
                guard let id = p["id"] as? String else { return nil }
                return (id, p["text"] as? String ?? "", p["x"] as? Double ?? 0, p["y"] as? Double ?? 0)
            }
            return XIConstellation(id: doc.documentID, name: d["name"] as? String ?? "Untitled",
                                   placed: (d["placed"] as? [String]) ?? [], positions: pos,
                                   connections: conns, pins: pinArr)
        }
    }

    func deleteConstellation(_ id: String) async {
        guard let uid = Auth.auth().currentUser?.uid else { return }
        try? await db.collection("users").document(uid)
            .collection("constellations").document(id).delete()
    }

    // MARK: Shared boards (link-based, cross-compatible with the web)

    /// Posted after a shared board is imported as a new (now active) board, so
    /// the boards screen reloads even if it's already on screen.
    static let boardImportedNotification = Notification.Name("xiBoardImported")

    /// Publish the current board as a `sharedBoards/{shareId}` snapshot that the
    /// web viewer at /share/{id} can open. Returns the share id.
    /// snapshotJpeg: a rendered picture of the whole board — served by the
    /// sharePreview function as the link's preview image, so texting the link
    /// shows the board itself.
    func shareBoard(name: String, memories: [XIMemory], placedIds: [String],
                    positions: [String: CGPoint],
                    connections: [(String, String, String)],
                    pins: [(id: String, text: String)] = [],
                    snapshotJpeg: Data? = nil) async -> String? {
        guard let uid = Auth.auth().currentUser?.uid else { return nil }
        let firstName = await sharerFirstName(uid: uid)
        let byId = Dictionary(memories.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let placedSet = Set(placedIds)

        var dropped: [[String: Any]] = []
        for id in placedIds {
            guard let m = byId[id] else { continue }
            let p = positions[id] ?? .zero
            dropped.append([
                "id": id, "x": Double(p.x), "y": Double(p.y),
                "title": m.title, "description": m.content,
                "tags": m.hashtags, "createdAt": m.timestamp,
            ])
        }
        let conns: [[String: Any]] = connections
            .filter { placedSet.contains($0.0) && placedSet.contains($0.1) }
            .map { ["id": "conn-\($0.0)-\($0.1)", "from": $0.0, "to": $0.1, "insight": $0.2] }

        let shareId = Self.randomShareId()
        let pinArr: [[String: Any]] = pins.compactMap { p in
            guard let pt = positions[p.id] else { return nil }
            return ["id": p.id, "text": p.text, "x": Double(pt.x), "y": Double(pt.y)]
        }
        var doc: [String: Any] = [
            "name": name.isEmpty ? "My board" : name,
            "sharedBy": ["userId": uid, "firstName": firstName],
            "sharedWith": ["name": "you"],
            "memoryCount": dropped.count,
            "droppedMemories": dropped,
            "connections": conns,
            "standalonePins": pinArr,
            "createdAt": FieldValue.serverTimestamp(),
            "updatedAt": FieldValue.serverTimestamp(),
        ]
        if let jpeg = snapshotJpeg {
            doc["snapshotB64"] = jpeg.base64EncodedString()
        }
        do {
            try await db.collection("sharedBoards").document(shareId).setData(doc)
            return shareId
        } catch { return nil }
    }

    /// Import a shared board's memories into the current account (non-destructive
    /// — they land in the library, tagged with `importedFrom`). Returns the count.
    @discardableResult
    func importSharedBoard(_ shareId: String) async -> Int {
        guard let uid = Auth.auth().currentUser?.uid else { return 0 }
        guard let snap = try? await db.collection("sharedBoards").document(shareId).getDocument(),
              let data = snap.data() else { return 0 }
        let dropped = (data["droppedMemories"] as? [[String: Any]]) ?? []
        let iso = ISO8601DateFormatter(); iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let df = DateFormatter(); df.dateStyle = .short; df.timeStyle = .none
        var count = 0
        for m in dropped {
            let title = m["title"] as? String ?? ""
            let content = (m["description"] as? String) ?? (m["content"] as? String) ?? ""
            let tags = (m["tags"] as? [String]) ?? (m["hashtags"] as? [String]) ?? []
            if title.isEmpty && content.isEmpty { continue }
            let now = Date()
            let doc: [String: Any] = [
                "title": title, "content": content, "hashtags": tags,
                "source": "shared", "importedFrom": shareId, "mode": "board",
                "timestamp": iso.string(from: now), "dateTime": df.string(from: now),
                "createdAt": FieldValue.serverTimestamp(),
                "updatedAt": FieldValue.serverTimestamp(),
            ]
            _ = try? await db.collection("users").document(uid)
                .collection("memories").addDocument(data: doc)
            count += 1
        }
        return count
    }

    /// Light metadata for a shared board (who shared it, how many memories) —
    /// used to show the "Add to your Commons?" prompt before importing.
    func sharedBoardInfo(_ shareId: String) async -> (sharer: String, count: Int)? {
        guard let snap = try? await db.collection("sharedBoards").document(shareId).getDocument(),
              let data = snap.data() else { return nil }
        let dropped = (data["droppedMemories"] as? [[String: Any]]) ?? []
        let sharer = ((data["sharedBy"] as? [String: Any])?["firstName"] as? String) ?? ""
        return (sharer.isEmpty ? "A friend" : sharer, dropped.count)
    }

    /// Import a shared board's memories into the Commons (friends' memories),
    /// attributed to whoever shared it — NOT into your own library. Returns the
    /// count actually added (de-duped).
    @discardableResult
    func importSharedBoardToCommons(_ shareId: String) async -> Int {
        guard let snap = try? await db.collection("sharedBoards").document(shareId).getDocument(),
              let data = snap.data() else { return 0 }
        let dropped = (data["droppedMemories"] as? [[String: Any]]) ?? []
        let sharer = ((data["sharedBy"] as? [String: Any])?["firstName"] as? String) ?? "A friend"
        var count = 0
        for m in dropped {
            let title = m["title"] as? String ?? ""
            let content = (m["description"] as? String) ?? (m["content"] as? String) ?? ""
            let tags = (m["tags"] as? [String]) ?? (m["hashtags"] as? [String]) ?? []
            let added = await addToCommons(title: title, content: content, hashtags: tags,
                                           authorName: sharer.isEmpty ? "A friend" : sharer,
                                           sourceType: "sharedBoard", sourceId: shareId)
            if added { count += 1 }
        }
        return count
    }

    /// Import a shared board WHOLE: its memories land in your Commons
    /// (attributed to the sharer, de-duped like every Commons import), and a
    /// new board named after them recreates the canvas — positions, strings
    /// with their insights, and concept pins intact. The new board becomes the
    /// active one. Returns the board and how many memories were newly added.
    func importSharedBoardAsBoard(_ shareId: String) async -> (board: XIBoardData, added: Int)? {
        guard let uid = Auth.auth().currentUser?.uid else { return nil }
        guard let snap = try? await db.collection("sharedBoards").document(shareId).getDocument(),
              let data = snap.data() else { return nil }
        let sharerRaw = ((data["sharedBy"] as? [String: Any])?["firstName"] as? String) ?? ""
        let sharer = sharerRaw.isEmpty ? "A friend" : sharerRaw
        let dropped = (data["droppedMemories"] as? [[String: Any]]) ?? []

        // Memories → Commons, remembering shared-id → commons-id so the
        // layout and strings can follow the cards.
        var idMap: [String: String] = [:]
        var added = 0
        for m in dropped {
            guard let oldId = m["id"] as? String else { continue }
            let title = m["title"] as? String ?? ""
            let content = (m["description"] as? String) ?? (m["content"] as? String) ?? ""
            let tags = (m["tags"] as? [String]) ?? (m["hashtags"] as? [String]) ?? []
            guard let r = await addToCommonsReturningId(title: title, content: content,
                                                        hashtags: tags, authorName: sharer,
                                                        sourceType: "sharedBoard", sourceId: shareId)
            else { continue }
            idMap[oldId] = r.id
            if r.isNew { added += 1 }
        }

        // Recreate the canvas on a fresh board.
        var positions: [String: CGPoint] = [:]
        var placed: [String] = []
        for m in dropped {
            guard let oldId = m["id"] as? String, let newId = idMap[oldId] else { continue }
            let x = (m["x"] as? Double) ?? 0
            let y = (m["y"] as? Double) ?? 0
            positions[newId] = CGPoint(x: x, y: y)
            placed.append(newId)
        }
        var pins: [(id: String, text: String)] = []
        for p in (data["standalonePins"] as? [[String: Any]]) ?? [] {
            guard let pid = p["id"] as? String else { continue }
            pins.append((pid, p["text"] as? String ?? ""))
            if let x = p["x"] as? Double, let y = p["y"] as? Double {
                positions[pid] = CGPoint(x: x, y: y)
            }
        }
        let conns: [(String, String, String)] = ((data["connections"] as? [[String: Any]]) ?? [])
            .compactMap { c in
                guard let f = c["from"] as? String, let t = c["to"] as? String,
                      let nf = idMap[f], let nt = idMap[t] else { return nil }
                return (nf, nt, c["insight"] as? String ?? "")
            }

        let ref = boardsRef(uid).document()
        let board = XIBoardData(id: ref.documentID, name: "\(sharer)'s board",
                                positions: positions, placed: placed,
                                pins: pins, connections: conns)
        try? await ref.setData(encodeBoard(board))
        try? await activePointerRef(uid).setData(["boardId": ref.documentID])
        return (board, added)
    }

    private func sharerFirstName(uid: String) async -> String {
        if let snap = try? await db.collection("users").document(uid)
            .collection("profile").document("current").getDocument(),
           let fn = snap.data()?["firstName"] as? String, !fn.isEmpty { return fn }
        if let dn = Auth.auth().currentUser?.displayName,
           let first = dn.split(separator: " ").first { return String(first) }
        if let email = Auth.auth().currentUser?.email,
           let prefix = email.split(separator: "@").first { return String(prefix).capitalized }
        return "Someone"
    }

    static func randomShareId() -> String {
        let chars = Array("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
        return String((0..<12).map { _ in chars.randomElement()! })
    }

    // MARK: Memory edits (used by archive bulk actions)

    func deleteMemory(_ id: String) async {
        guard let uid = Auth.auth().currentUser?.uid else { return }
        try? await db.collection("users").document(uid)
            .collection("memories").document(id).delete()
    }

    func updateMemoryHashtags(_ id: String, _ hashtags: [String]) async {
        guard let uid = Auth.auth().currentUser?.uid else { return }
        try? await db.collection("users").document(uid)
            .collection("memories").document(id)
            .updateData(["hashtags": hashtags, "updatedAt": FieldValue.serverTimestamp()])
    }

    private func slugTag(_ cap: String) -> String? {
        let slug = cap.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "[^a-z0-9]+", with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        return slug.isEmpty ? nil : "#\(slug)"
    }
}
