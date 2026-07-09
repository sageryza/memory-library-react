import Foundation

/// Warms the card-art cache at launch so the first cards on Today / Daily
/// appear instantly instead of streaming in over the network. Card art is
/// static (`/xi-cards/*.webp` on hosting), so a bigger shared URLCache plus a
/// background prefetch of today's cards makes the reuse essentially free.
enum XIImagePrefetch {
    static func warm() {
        // A generous shared cache that AsyncImage (URLSession.shared) reuses.
        URLCache.shared = URLCache(memoryCapacity: 64 * 1024 * 1024,
                                   diskCapacity: 256 * 1024 * 1024)
        Task.detached(priority: .utility) {
            var imgs = Set<String>()
            let dn = BoardEngine.dayNumber()
            // The whole daily board (covers the Daily screen).
            for p in BoardEngine.dailyBoard(dn) {
                let card = p.d == "be" ? XIDeck.events[p.i] : XIDeck.twists[p.i]
                if let img = card.img { imgs.insert(img) }
            }
            // Today's opening pair + a few redraws: events walk FORWARD from the
            // front of the deck, twists walk BACKWARD from the END — so warm the
            // twist deck's tail, not its head.
            for c in XIDeck.events.prefix(16) { if let img = c.img { imgs.insert(img) } }
            for c in XIDeck.twists.suffix(16) { if let img = c.img { imgs.insert(img) } }
            // The last week of past-day pairs (Today's ‹ › arrows) — same
            // deterministic walk TodayView.pairForDay uses.
            let ne = XIDeck.events.count, nt = XIDeck.twists.count
            if ne > 0 && nt > 0 {
                for d in max(1, dn - 7)...dn {
                    if let img = XIDeck.events[((d % ne) + ne) % ne].img { imgs.insert(img) }
                    if let img = XIDeck.twists[((((nt - 1 - d) % nt) + nt) % nt)].img { imgs.insert(img) }
                }
            }
            // The Versus lobby preview board (real card art, cells 0–24 of each deck).
            for c in XIDeck.events.prefix(25) { if let img = c.img { imgs.insert(img) } }
            for c in XIDeck.twists.prefix(25) { if let img = c.img { imgs.insert(img) } }

            await withTaskGroup(of: Void.self) { group in
                for img in imgs {
                    guard let url = URL(string: XITheme.cardArtBase + img) else { continue }
                    group.addTask {
                        var req = URLRequest(url: url)
                        req.cachePolicy = .returnCacheDataElseLoad
                        _ = try? await URLSession.shared.data(for: req)
                    }
                }
            }
        }
    }
}
