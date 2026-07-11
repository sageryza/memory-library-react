import SwiftUI

/// A "Tower" is one idea traced across the journals as it evolved — every time it
/// was defined, redefined, mentioned, or used as an example. Each tower is a
/// tile on the Towers screen; tapping it opens the idea's trajectory.
///
/// Content note: the journal transcribed *inside this app* covers Jan 31 – Feb 17,
/// 2025 only. Ideas that started earlier (AutoPro's "program → process" shift in
/// the fall; the December coins) are seeded as `inCorpus: false` placeholders so
/// the trajectory reads whole now and the real entries can drop in once those
/// journals are transcribed.

enum TowerEntryKind: String {
    case definition   // named / first defined
    case redefinition // meaning shifted
    case mention      // referenced in passing
    case example      // used to describe a concrete instance
    case imagery      // shows up as an image/metaphor before it's a concept

    var label: String {
        switch self {
        case .definition:   return "defined"
        case .redefinition: return "redefined"
        case .mention:      return "mentioned"
        case .example:      return "example"
        case .imagery:      return "imagery"
        }
    }

    var tint: Color {
        switch self {
        case .definition:   return Color(red: 0.42, green: 0.36, blue: 0.65) // violet
        case .redefinition: return Color(red: 0.16, green: 0.47, blue: 0.77) // blue
        case .mention:      return Color(white: 0.55)
        case .example:      return Color(red: 0.30, green: 0.55, blue: 0.35) // green
        case .imagery:      return Color(red: 0.80, green: 0.52, blue: 0.24) // amber
        }
    }
}

struct TowerEntry: Identifiable {
    let id = UUID()
    let date: String?   // "Feb 6", "~Sept", "Christmas" — free text, journals aren't all dated
    let page: Int?      // journal page, when it's in the in-app corpus
    let kind: TowerEntryKind
    let quote: String
    let note: String?   // a gloss on what shifted here
    var inCorpus: Bool = true  // false = known but not yet transcribed into the app
}

/// A tab within a tower's detail. Not every tower has the same set — Coins has no
/// Examples tab, AutoPro does.
enum TowerTab: String, CaseIterable, Identifiable {
    case trajectory = "Trajectory"
    case examples   = "Examples"
    var id: String { rawValue }
}

struct Tower: Identifiable {
    let id = UUID()
    let name: String
    let blurb: String        // one line: what the idea is
    let symbol: String       // SF Symbol for the tile (swap for custom art later)
    let tint: Color
    let trajectory: [TowerEntry]
    let examples: [TowerEntry]

    /// Only surface tabs that actually have content.
    var tabs: [TowerTab] {
        var t: [TowerTab] = [.trajectory]
        if !examples.isEmpty { t.append(.examples) }
        return t
    }
}

enum TowersData {
    static let all: [Tower] = [autoPro, coins, journals, tots, hiddenMechanism, tray, newOldThoughts, instruments]

    // MARK: AutoPro — automatic program → automatic process → autopro / AP
    static let autoPro = Tower(
        name: "AutoPro",
        blurb: "A self-assigned process you run on yourself.",
        symbol: "gearshape.2.fill",
        tint: Color(red: 0.42, green: 0.36, blue: 0.65),
        trajectory: [
            TowerEntry(date: "~Sept", page: nil, kind: .definition,
                quote: "“automatic program” — the original coinage.",
                note: "The starting point you described. Not yet transcribed — from the fall journals.",
                inCorpus: false),
            TowerEntry(date: "~Oct", page: nil, kind: .redefinition,
                quote: "“automatic process” — program becomes process.",
                note: "The shift you described; add the exact entry once the fall journals are in.",
                inCorpus: false),
            TowerEntry(date: "early Feb", page: 12, kind: .definition,
                quote: "autopro: look at each plant and decide what you like about it… draw × map each plant as if you need to do it for the exercise.",
                note: "First in-app appearance — an autopro as a self-assigned exercise."),
            TowerEntry(date: nil, page: 21, kind: .mention,
                quote: "I tried to make an autopro for me to do when he left.",
                note: "Now a coping tool — a process she runs on herself."),
            TowerEntry(date: "Feb 6", page: 29, kind: .redefinition,
                quote: "inspiration and brute force are both different autopros, with different rules.",
                note: "Generalized: autopros as a category, each with its own rule-set."),
            TowerEntry(date: "Feb 11", page: 51, kind: .mention,
                quote: "the days I spent at Primo Passo, buying autopros in bags, hidden mechanism, autopro.",
                note: nil),
            TowerEntry(date: "Feb 13", page: 60, kind: .redefinition,
                quote: "My retroactive goal is to design an autopro that…",
                note: "Starts treating an autopro as something deliberately designed."),
            TowerEntry(date: "Feb 17", page: 68, kind: .definition,
                quote: "design an autopro in which the steps towards the goal are necessarily embedded.",
                note: "Most evolved: an autopro as a process with its steps built in."),
        ],
        examples: [
            TowerEntry(date: nil, page: 23, kind: .example,
                quote: "the autopro of telling yourself to start collecting a certain pattern… you'll do it once you open the drawer.",
                note: nil),
            TowerEntry(date: nil, page: 23, kind: .example,
                quote: "the autopro moment in the shower in Rebecca's mirror.",
                note: nil),
            TowerEntry(date: "Feb 12", page: 57, kind: .example,
                quote: "planning an autopro that doesn't involve any “innie” work.",
                note: nil),
        ]
    )

    // MARK: Coins — imagery → currency for thoughts → fungible money
    static let coins = Tower(
        name: "Coins",
        blurb: "Coins as the currency of thoughts and ideas.",
        symbol: "circlebadge.2.fill",
        tint: Color(red: 0.80, green: 0.60, blue: 0.20),
        trajectory: [
            TowerEntry(date: "Christmas", page: nil, kind: .mention,
                quote: "wanting Jonathan and his brother to think of me — “thoughts for coins.”",
                note: "From December — not transcribed yet.",
                inCorpus: false),
            TowerEntry(date: nil, page: nil, kind: .redefinition,
                quote: "“coins for coins” — fungible money.",
                note: "Add when that entry is in.",
                inCorpus: false),
            TowerEntry(date: "early Feb", page: 12, kind: .imagery,
                quote: "coins… that's where they steal our stuff — the plants, hiding golden coins in the soil.",
                note: "Coins first show up as imagery: stolen treasure."),
            TowerEntry(date: nil, page: 13, kind: .imagery,
                quote: "plants stealing coins in the middle of the night.",
                note: nil),
            TowerEntry(date: "Feb 4", page: 25, kind: .definition,
                quote: "One thought can be bought for coins — sweet, shiny, new coins that pay. Buddhism is a gumball machine, where each gumball is a coin.",
                note: "The turn: coins become the currency of thoughts."),
            TowerEntry(date: "Feb 4", page: 26, kind: .redefinition,
                quote: "you don't need the idea if you have one shiny new nickel — the object suggests the idea.",
                note: "A coin/object can stand in for a whole idea."),
            TowerEntry(date: "Feb 11", page: 53, kind: .mention,
                quote: "the plants stealing the silver coins.",
                note: "Callback that ties the imagery back together."),
            TowerEntry(date: "Feb", page: nil, kind: .redefinition,
                quote: "trading thoughts for coins — a thought is worth more if you've never had it before.",
                note: "You mentioned this one; I couldn't find the exact line in the transcribed pages — point me to it and I'll wire it in.",
                inCorpus: false),
        ],
        examples: []
    )

    // MARK: Journals — how to transcribe / see them all (this app is the "after")
    static let journals = Tower(
        name: "Journals",
        blurb: "How to transcribe — and actually see — all of them.",
        symbol: "books.vertical.fill",
        tint: Color(red: 0.35, green: 0.30, blue: 0.55),
        trajectory: [
            TowerEntry(date: "Feb", page: 16, kind: .definition,
                quote: "finishing making cheat sheets for my journal… that was quite fun last night.",
                note: "Early method: hand-drawn “cheat sheets” to index the pages."),
            TowerEntry(date: nil, page: 18, kind: .redefinition,
                quote: "make a book of dreams (I found a lot of dreams on scraps of paper in my files).",
                note: "Collect one kind of entry across all the journals."),
            TowerEntry(date: nil, page: 18, kind: .mention,
                quote: "I scanned in like 350 papers… scanned through them as one big document, typed some entries in as comments.",
                note: "The genius-scan + typing pass."),
            TowerEntry(date: "Feb 7", page: 35, kind: .redefinition,
                quote: "summarizing the thoughts of months past, and made speedy progress.",
                note: "Summarize-by-month approach."),
            TowerEntry(date: "after", page: nil, kind: .definition,
                quote: "…this app — the Journal Reader itself.",
                note: "The current form of the idea. It lives outside the journals — an “after.”",
                inCorpus: false),
        ],
        examples: []
    )

    // MARK: Tots — the unit of thought you collect
    static let tots = Tower(
        name: "Tots",
        blurb: "A single captured thought — the unit you collect.",
        symbol: "sparkles",
        tint: Color(red: 0.20, green: 0.52, blue: 0.52),
        trajectory: [
            TowerEntry(date: "early Feb", page: 19, kind: .definition,
                quote: "I struggled with how to represent the Tots (this was their genesis) — and to turn them into receipts.",
                note: "Genesis — Tots as thoughts to be represented and collected."),
            TowerEntry(date: "Feb 6", page: 29, kind: .redefinition,
                quote: "the pre-Tot was: it's nice that I have more than one kind of work I can do.",
                note: "A “pre-Tot” — the seed a Tot grows from."),
            TowerEntry(date: "Feb 7", page: 35, kind: .mention,
                quote: "On October 24th, I was so sure that I was going to finish the Tot assignment.",
                note: nil),
            TowerEntry(date: "Feb 11", page: 50, kind: .redefinition,
                quote: "An unrecognized Tot is when I say: “Oh — I need to summarize everything, so: bit by bit, in order.”",
                note: "Names a new kind: the unrecognized Tot."),
            TowerEntry(date: "Feb 13", page: 60, kind: .mention,
                quote: "things like the 24th — the Tot day — are quite sticky, quite contagious.",
                note: nil),
        ],
        examples: [
            TowerEntry(date: nil, page: 20, kind: .example,
                quote: "Tot: “I tried to explain to grant… you listen to sad songs all day.”",
                note: nil),
            TowerEntry(date: "Feb 12", page: 57, kind: .example,
                quote: "The Tot after I got myself off was planning an autopro that doesn't involve any “innie” work.",
                note: nil),
        ]
    )

    // MARK: Hidden mechanism — the concealed structure running the show
    static let hiddenMechanism = Tower(
        name: "Hidden Mechanism",
        blurb: "A concealed structure quietly running the show.",
        symbol: "puzzlepiece.fill",
        tint: Color(red: 0.20, green: 0.42, blue: 0.70),
        trajectory: [
            TowerEntry(date: "Feb 7", page: 35, kind: .definition,
                quote: "The hidden mechanism was that there were only perhaps 2–3 thoughts in November, one in December, and 2 in January.",
                note: "First in-app use — a concealed reason things were easier than they looked."),
            TowerEntry(date: "Feb 8", page: 40, kind: .redefinition,
                quote: "The hidden mechanism of turning it on and off gives me a headache — trying to paint the inside of my mind.",
                note: "Turns reflexive — a mechanism running inside herself."),
            TowerEntry(date: "Feb 11", page: 53, kind: .definition,
                quote: "a “hidden mechanism” poster, with all the different uses of hidden mechanisms in a constellation.",
                note: "Most evolved — collect every hidden mechanism into one constellation."),
        ],
        examples: [
            TowerEntry(date: "Feb 11", page: 52, kind: .example,
                quote: "there was a hidden mechanism in which the whole world was pretending it was one thing by calling it therapy.",
                note: nil),
        ]
    )

    // MARK: The tray — lay thoughts out and find what they share
    static let tray = Tower(
        name: "The Tray",
        blurb: "A tray to lay thoughts on and find what they share.",
        symbol: "tray.fill",
        tint: Color(red: 0.34, green: 0.52, blue: 0.32),
        trajectory: [
            TowerEntry(date: "Feb 4", page: 25, kind: .definition,
                quote: "I forgot what a tray was for, and started putting memories on it. Then the game was easy and obvious: figure out what they have in common.",
                note: "Genesis — a tray to lay memories on and find the link."),
            TowerEntry(date: "Feb 11", page: 49, kind: .mention,
                quote: "continuing on the train of the tray idea.",
                note: nil),
            TowerEntry(date: "Feb 12", page: 54, kind: .redefinition,
                quote: "The tray idea — I can put stickers on bead trays, because they are temporary, because they are preparing for something.",
                note: "Trays as temporary staging — a place things wait."),
        ],
        examples: []
    )

    // MARK: New thoughts vs old thoughts
    static let newOldThoughts = Tower(
        name: "New vs Old Thoughts",
        blurb: "Which thoughts are actually new — and worth keeping.",
        symbol: "lightbulb.fill",
        tint: Color(red: 0.70, green: 0.38, blue: 0.48),
        trajectory: [
            TowerEntry(date: "Feb 6", page: 31, kind: .definition,
                quote: "I had a new thought, and it was that “I don't always have new thoughts” — a lot of my thoughts are old, I have them over and over.",
                note: "Genesis — and self-referential: the new thought is about new thoughts."),
            TowerEntry(date: "Feb 6", page: 32, kind: .mention,
                quote: "The thoughts that I dredged up in the garden that day, on purpose, were old thoughts and not worthy of commemorating.",
                note: nil),
            TowerEntry(date: "Feb 11", page: 50, kind: .redefinition,
                quote: "I've been thinking about “New thoughts and old thoughts.”",
                note: "Names it as a standing way to sort what she writes."),
        ],
        examples: []
    )

    // MARK: Instruments of abstraction / zooming in
    static let instruments = Tower(
        name: "Instruments of Abstraction",
        blurb: "Tools for abstracting — and zooming in to see.",
        symbol: "pencil.and.ruler.fill",
        tint: Color(red: 0.36, green: 0.44, blue: 0.55),
        trajectory: [
            TowerEntry(date: "early Feb", page: 19, kind: .imagery,
                quote: "I “abstracted” the two maps games… you'd have to zoom in to find what the games are about.",
                note: "Early: abstracting by hiding the meaning until you zoom in."),
            TowerEntry(date: "Feb 6", page: 32, kind: .mention,
                quote: "“zooming in” about abstraction — a reel idea.",
                note: nil),
            TowerEntry(date: "Feb 7", page: 35, kind: .definition,
                quote: "I discussed fine-tipped instruments of abstraction with myself.",
                note: "Names the tools: fine-tipped instruments of abstraction."),
            TowerEntry(date: "Feb 11", page: 51, kind: .mention,
                quote: "Instruments of Abstraction.",
                note: "Listed as a topic to gather."),
        ],
        examples: []
    )
}
