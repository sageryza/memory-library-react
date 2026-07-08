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
            // The whole daily board (covers the Daily screen).
            for p in BoardEngine.dailyBoard(BoardEngine.dayNumber()) {
                let card = p.d == "be" ? XIDeck.events[p.i] : XIDeck.twists[p.i]
                if let img = card.img { imgs.insert(img) }
            }
            // The first handful of each deck (covers Today's opening pair + a few
            // "new cards" reshuffles).
            for c in XIDeck.events.prefix(16) { if let img = c.img { imgs.insert(img) } }
            for c in XIDeck.twists.prefix(16) { if let img = c.img { imgs.insert(img) } }

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
