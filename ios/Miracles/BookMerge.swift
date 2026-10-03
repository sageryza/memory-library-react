import Foundation

/// Merges the book on this phone with the cloud copy, page by page.
///
/// - Nothing written on this phone (a fresh install, or a reinstall with the
///   cloud copy still saved): the cloud copy wins outright — an empty book is
///   never the authority over one with content.
/// - A page both sides have: the newer `updatedAt` wins (a tie keeps this
///   phone's copy).
/// - A page only one side has is kept: cloud-only pages in the cloud's order,
///   then this phone's own new pages after them. Nothing is dropped.
enum BookMerge {
    struct Outcome {
        var pages: [MiraclePage]
        /// Pages the cloud is missing or holds an older copy of.
        var push: Set<String>
    }

    /// The cloud's book, put together from what a read found: the page docs,
    /// plus — while the top doc is still in the first format — the pages in
    /// its one-string `data` field, where a page doc at least as new wins.
    /// In `order` first, then any pages the order doesn't name, oldest first.
    static func cloudBook(pageDocs: [MiraclePage], firstFormat: [MiraclePage], order: [String]) -> [MiraclePage] {
        var byID: [String: MiraclePage] = [:]
        for page in pageDocs { byID[page.id] = page }
        for page in firstFormat {
            if let stored = byID[page.id], stored.updatedAt >= page.updatedAt { continue }
            byID[page.id] = page
        }
        var pages: [MiraclePage] = []
        for id in order {
            if let page = byID.removeValue(forKey: id) { pages.append(page) }
        }
        pages += byID.values.sorted { ($0.date, $0.id) < ($1.date, $1.id) }
        return pages
    }

    static func merge(local: [MiraclePage], remote: [MiraclePage]) -> Outcome {
        let localHasContent = local.contains { $0.hasContent }
        let remoteHasContent = remote.contains { $0.hasContent }

        if !localHasContent {
            return remoteHasContent ? Outcome(pages: remote, push: []) : Outcome(pages: local, push: [])
        }
        if remote.isEmpty {
            return Outcome(pages: local, push: Set(local.map(\.id)))
        }

        let localByID = Dictionary(local.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        var merged: [MiraclePage] = []
        var push = Set<String>()
        var seen = Set<String>()

        for theirs in remote where !seen.contains(theirs.id) {
            seen.insert(theirs.id)
            if let ours = localByID[theirs.id], ours.updatedAt >= theirs.updatedAt {
                merged.append(ours)
                if ours != theirs { push.insert(ours.id) }
            } else {
                merged.append(theirs)
            }
        }
        for ours in local where !seen.contains(ours.id) {
            seen.insert(ours.id)
            merged.append(ours)
            push.insert(ours.id)
        }
        return Outcome(pages: merged, push: push)
    }
}
