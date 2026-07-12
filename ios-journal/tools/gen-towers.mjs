// Regenerate JournalReader/Tower.swift by mining every tower's instances from
// journal_timeline.html across the full journal. Curated Trajectory = a spread
// across the whole arc; All-mentions = every instance. Run from ios-journal/:
//   node tools/gen-towers.mjs
import fs from 'fs';
const HTML = fs.readFileSync(new URL('../JournalReader/journal_timeline.html', import.meta.url), 'utf8');
const OUT  = new URL('../JournalReader/Tower.swift', import.meta.url);

const re = /\{page:(\d+),type:"([^"]+)",(.*?)text:(?:`([\s\S]*?)`|"((?:[^"\\]|\\.)*)")\}/g;
let m, secs = [];
while ((m = re.exec(HTML))) {
  const text = (m[4] !== undefined ? m[4] : m[5].replace(/\\"/g, '"').replace(/\\n/g, '\n'));
  secs.push({ page: +m[1], type: m[2], meta: m[3], text });
}
const dateOf = meta => { const d = meta.match(/date:"([^"]+)"/); return d ? d[1] : ''; };
const sents = t => t.split(/(?<=[.!?…])\s+|\n/).map(s => s.trim()).filter(Boolean);
const mine = rx => {
  const out = [];
  for (const s of secs) if (rx.test(s.text)) {
    const q = (sents(s.text).find(x => rx.test(x)) || '');
    out.push({ page: s.page, date: dateOf(s.meta), type: s.type, quote: q });
  }
  return out;
};
const clean = q => q.replace(/<[^>]+>/g, '').replace(/@@PB@@/g, '')
  .replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/\s+/g, ' ').trim();
const esc = s => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const trunc = (s, n = 200) => s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s;

// key, regex, name, blurb, SF Symbol, tint rgb, optional drop-regex for false positives
const CFG = [
  ['autopro', /auto\s?pro|automatic (program|process)/i, 'AutoPro', 'A self-assigned process you run on yourself — automatic program → process → autopro.', 'gearshape.2.fill', [0.42,0.36,0.65]],
  ['coins', /\bcoins?\b|fungible|nickel/i, 'Coins', 'Coins as the currency of thoughts and ideas.', 'circlebadge.2.fill', [0.80,0.60,0.20]],
  ['tot', /\bTots?\b|train of thought|pre-?Tot/, 'Train of Thought', 'A train of thought — the unit she captures and collects (a “Tot”).', 'tram.fill', [0.20,0.52,0.52]],
  ['hiddenMechanism', /hidden mechanism/i, 'Hidden Mechanism', 'A concealed structure quietly running the show.', 'puzzlepiece.fill', [0.20,0.42,0.70]],
  ['tray', /\btray\b/i, 'The Tray', 'A tray to lay thoughts on and find what they share.', 'tray.fill', [0.34,0.52,0.32]],
  ['newOldThoughts', /new thought|old thought/i, 'New vs Old Thoughts', 'Which thoughts are actually new — and worth keeping.', 'lightbulb.fill', [0.70,0.38,0.48]],
  ['instruments', /instrument.{0,15}abstraction|zoom(ing)? in|fine-?tipped/i, 'Instruments of Abstraction', 'Tools for abstracting — and zooming in to see.', 'pencil.and.ruler.fill', [0.36,0.44,0.55]],
  ['ambiguousEvent', /ambiguous event/i, 'The Ambiguous Event', 'The cornerstone she keeps circling back to.', 'questionmark.diamond.fill', [0.45,0.30,0.62]],
  ['competingPatterns', /competing pattern/i, 'Competing Patterns', 'Two things at once — why competing patterns make something richer.', 'square.on.square', [0.24,0.50,0.60]],
  ['mapsGame', /\bmaps?\b|mapping|lord of maps/i, 'The Maps Game', 'Drawing maps of the mind — and of other people’s — to see where thoughts live.', 'map.fill', [0.42,0.48,0.28], /google maps/i],
  ['stickers', /sticker/i, 'The Stickers Project', 'Making, sorting, and sheeting the stickers.', 'seal.fill', [0.78,0.45,0.55]],
  ['priming', /priming|cognitive vehicle/i, 'Priming & Cognitive Vehicles', 'How a lead-in conjures a thought before you name it.', 'brain.head.profile', [0.55,0.35,0.60]],
  ['receipts', /receipt|sugar packet/i, 'Receipts', 'Turning thoughts into receipts and dated little packets.', 'scroll.fill', [0.55,0.42,0.28]],
  ['nonAction', /non-?action|fourth quarter/i, 'Non-Action', 'The task you can’t do because it isn’t an action.', 'pause.circle.fill', [0.40,0.45,0.52]],
  ['innieOutie', /\binnie|\boutie|severance/i, 'Innie / Outie', 'Her Severance-style model of the self at work.', 'person.2.fill', [0.30,0.34,0.62]],
  ['patternManip', /pattern manipulation/i, 'Pattern Manipulation', 'Proactive and retroactive pattern manipulation.', 'wand.and.stars', [0.50,0.34,0.58]],
];
const spread = (list, n) => {
  if (list.length <= n) return list.map((_, i) => i);
  const idx = []; for (let i = 0; i < n; i++) idx.push(Math.round(i * (list.length - 1) / (n - 1)));
  return [...new Set(idx)];
};
const entryLit = (e, kind, note = 'nil') => {
  const q = esc(trunc(clean(e.quote)));
  if (!q) return null;
  const date = e.date ? `"${esc(e.date)}"` : 'nil';
  return `            TowerEntry(date: ${date}, page: ${e.page}, kind: .${kind}, quote: "${q}", note: ${note}),`;
};

// Hand-curated Trajectory per tower: the real defining/evolving moments (by page)
// with a short "what shifted here" note. Towers without an entry fall back to an
// even auto-spread. The quote for each page is pulled from the mined data.
const CURATED = {
  autopro: [
    { page: 299, kind: 'definition',   note: 'First named — “automatic program,” at the club.' },
    { page: 319, kind: 'redefinition', note: 'Program becomes “automatic process.”' },
    { page: 332, kind: 'mention',      note: 'The point: a process so she never has to make decisions.' },
    { page: 396, kind: 'mention',      note: 'Her autopros are secret, internal; the output is random.' },
    { page: 405, kind: 'redefinition', note: 'First shortened to “autopros.”' },
    { page: 457, kind: 'definition',   note: 'Concrete definition — a designed process: detangling, categorizing, a straight line.' },
    { page: 923, kind: 'mention',      note: 'Applied to the plant business.' },
    { page: 957, kind: 'redefinition', note: 'Goal: design an autopro with the steps embedded.' },
    { page: 1232, kind: 'definition',  note: 'Still going months later — clay autopros.' },
  ],
  coins: [
    { page: 149,  kind: 'imagery',      note: 'Coin envelopes in the memory library.' },
    { page: 162,  kind: 'mention',      note: 'A coin flip to randomize intentions.' },
    { page: 638,  kind: 'definition',   note: 'A “quarter-shaped nickel” for each time J mentions her — thoughts for coins.' },
    { page: 923,  kind: 'imagery',      note: 'Plants stealing coins in the night.' },
    { page: 931,  kind: 'definition',   note: 'One thought can be bought for coins.' },
    { page: 933,  kind: 'redefinition', note: 'Trading nickels for times someone remembered her.' },
    { page: 563,  kind: 'mention',      note: 'Competing patterns & ambiguous events — two sides of the same coin.' },
    { page: 986,  kind: 'redefinition', note: '“Clever coins” collected in a jar.' },
  ],
  tot: [
    { page: 306, kind: 'definition',   note: 'Named: ToT = train of thought.' },
    { page: 463, kind: 'definition',   note: '“seed / pre-Tot” introduced.' },
    { page: 486, kind: 'imagery',      note: 'Each cigarette a train of thought (Maira Kalman).' },
    { page: 927, kind: 'mention',      note: 'The genesis of how to represent the Tots.' },
    { page: 951, kind: 'redefinition', note: 'Trace each Tot back to its genesis.' },
    { page: 1212, kind: 'mention',     note: 'Still capturing pre-Tots months on.' },
  ],
  hiddenMechanism: [
    { page: 414, kind: 'definition',   note: 'Named: “the hidden mechanism idea.”' },
    { page: 418, kind: 'mention',      note: 'The kit “designed by someone else” before you get it.' },
    { page: 477, kind: 'mention',      note: '“There is no hidden mechanism” — take it out.' },
    { page: 493, kind: 'redefinition', note: 'Discovered at the storage unit: the weird adjustments we make.' },
    { page: 886, kind: 'redefinition', note: 'Its hostility turns into delight — “see, it’s not that hard.”' },
    { page: 941, kind: 'mention',      note: 'Turning it on and off — painting the inside of her mind.' },
    { page: 1149, kind: 'definition',  note: 'Uncovering hidden mechanisms, with faith you reach the end.' },
  ],
  tray: [
    { page: 81,  kind: 'imagery',      note: 'First tray image — body parts on a tea tray.' },
    { page: 358, kind: 'definition',   note: 'The “Bead Tray Idea.”' },
    { page: 558, kind: 'mention',      note: 'The tray idea led to the Tots.' },
    { page: 931, kind: 'definition',   note: 'Forgot what a tray was for — started putting memories on it.' },
    { page: 953, kind: 'redefinition', note: 'Iterations of the tray idea end at the sticker one.' },
    { page: 1007, kind: 'mention',     note: 'A tray of drinks — the appeal is trying all of them.' },
  ],
  newOldThoughts: [
    { page: 91,   kind: 'definition',   note: '“new thought:” — the header.' },
    { page: 210,  kind: 'mention',      note: 'Typing out old thoughts — a slow, steady job.' },
    { page: 316,  kind: 'mention',      note: '“Step three: have entirely new thoughts.”' },
    { page: 934,  kind: 'definition',   note: 'The new thought: “I don’t always have new thoughts.”' },
    { page: 949,  kind: 'redefinition', note: 'Names it a standing way to sort what she writes.' },
    { page: 1118, kind: 'mention',      note: '“an old thought, so why is it worth writing again?”' },
  ],
  instruments: [
    { page: 71,   kind: 'imagery',      note: 'Zooming in on a photo’s background — the original move.' },
    { page: 105,  kind: 'definition',   note: 'Named: “instruments of abstraction.”' },
    { page: 559,  kind: 'mention',      note: 'The idea she worked on at the beach.' },
    { page: 938,  kind: 'redefinition', note: '“fine-tipped instruments of abstraction.”' },
    { page: 1073, kind: 'mention',      note: '“zooming in on fractals.”' },
  ],
  ambiguousEvent: [
    { page: 92,   kind: 'definition',   note: '“The centerpiece — the cornerstone — the kernel.”' },
    { page: 101,  kind: 'definition',   note: 'At the center of everything, like quantum mechanics — one or the other, can’t tell.' },
    { page: 201,  kind: 'mention',      note: '“it could be — either or — but I don’t know which.”' },
    { page: 514,  kind: 'redefinition', note: 'Designing ambiguous events for the future to use in the past.' },
    { page: 563,  kind: 'mention',      note: 'Two sides of the same coin with competing patterns.' },
    { page: 1118, kind: 'definition',   note: '“events that have one or more possible meanings.”' },
  ],
  competingPatterns: [
    { page: 8,    kind: 'definition',   note: '“a metaphor is competing patterns.”' },
    { page: 75,   kind: 'definition',   note: 'Collecting competing/contradictory patterns to practice nuance.' },
    { page: 481,  kind: 'mention',      note: 'goal → fake goal → competing patterns.' },
    { page: 563,  kind: 'redefinition', note: 'Two sides of the same coin with ambiguous events.' },
    { page: 636,  kind: 'imagery',      note: 'The star of paradox — two competing patterns.' },
    { page: 959,  kind: 'redefinition', note: 'A painting about two things at once is more interesting.' },
    { page: 1190, kind: 'mention',      note: 'A reverse scale — an exercise in accepting paradox.' },
  ],
  mapsGame: [
    { page: 296,  kind: 'definition',   note: 'First: “2 games about maps” — make the board match your map.' },
    { page: 366,  kind: 'mention',      note: '“literally mapping my brain — drawing a map of where everything is.”' },
    { page: 387,  kind: 'definition',   note: '“draw maps to see where things are in your head.”' },
    { page: 451,  kind: 'redefinition', note: 'Reading people and mapping their minds/categories.' },
    { page: 548,  kind: 'definition',   note: '“the answer is maps — maps of meaning.”' },
    { page: 953,  kind: 'mention',      note: '“Lord of Maps” — relates to the stickers.' },
    { page: 1203, kind: 'mention',      note: 'Still circling: “closer to lord of maps.”' },
  ],
  stickers: [
    { page: 149,  kind: 'imagery',      note: 'Pictures stickered onto coin envelopes.' },
    { page: 558,  kind: 'definition',   note: 'Type up everything, apply the diagrams as stickers.' },
    { page: 570,  kind: 'mention',      note: 'Making the diagrams into stickers; a zine.' },
    { page: 933,  kind: 'redefinition', note: 'Part four: extracting — re-imagining stickers as something else.' },
    { page: 942,  kind: 'mention',      note: '“I’m done with the sticker project.”' },
    { page: 953,  kind: 'redefinition', note: 'The tray idea’s iterations end at the sticker one.' },
    { page: 1218, kind: 'definition',   note: 'Now she wants to be able to see all the stickers.' },
  ],
  priming: [
    { page: 53,   kind: 'definition',   note: 'You collect patterns when there’s an unanswered question.' },
    { page: 79,   kind: 'definition',   note: 'A “cognitive vehicle” — a made thing that gets you somewhere in your brain.' },
    { page: 99,   kind: 'definition',   note: 'The drawer pull — the key to opening the drawer.' },
    { page: 103,  kind: 'mention',      note: 'A game is a cognitive vehicle.' },
    { page: 471,  kind: 'redefinition', note: '“another reason to use the word priming.”' },
    { page: 954,  kind: 'mention',      note: 'A cognitive vehicle to get back into her lane.' },
  ],
  receipts: [
    { page: 83,   kind: 'imagery',      note: 'People playing with sugar packets while waiting.' },
    { page: 297,  kind: 'definition',   note: '“This could all be in the form of a receipt.”' },
    { page: 391,  kind: 'mention',      note: 'A machine with a crank and receipt paper.' },
    { page: 476,  kind: 'mention',      note: 'Print the hoonies on fake sugar packets.' },
    { page: 950,  kind: 'redefinition', note: 'The receipt idea started waiting for Cassie.' },
    { page: 957,  kind: 'redefinition', note: 'Sugar packets with the date printed on them.' },
  ],
  nonAction: [
    { page: 411,  kind: 'definition',   note: 'Tied to the “fourth quarter” — it dismisses assumptions.' },
    { page: 852,  kind: 'definition',   note: '“one of those non-actions, very specific.”' },
    { page: 951,  kind: 'definition',   note: 'Can’t do the action because it’s “in the fourth quarter” — you don’t know what it is.' },
    { page: 1094, kind: 'mention',      note: 'Tried to explain the fourth quarter to J; he wasn’t interested.' },
    { page: 1169, kind: 'redefinition', note: 'The fourth quarter is invention — synthesizing new concepts.' },
    { page: 1212, kind: 'mention',      note: '“The fourth quarter: I wasn’t reading them.”' },
  ],
  innieOutie: [
    { page: 743,  kind: 'mention',      note: 'Severance comes out.' },
    { page: 940,  kind: 'definition',   note: 'When her systems get “unaligned” (severance), directives come from nowhere.' },
    { page: 954,  kind: 'definition',   note: '“my innie fought for her independence — I granted it — she walks free.”' },
    { page: 1206, kind: 'mention',      note: 'Wish fulfillment in Severance.' },
  ],
  patternManip: [
    { page: 92,   kind: 'definition',   note: 'Header: “Proactive and retroactive pattern manipulation.”' },
    { page: 102,  kind: 'mention',      note: '“retroactive pattern manipulation.”' },
    { page: 514,  kind: 'definition',   note: '“Going back in time: step one — retroactive pattern manipulation.”' },
    { page: 923,  kind: 'mention',      note: 'Rationalizing why she notices people nodding.' },
  ],
};

const names = [], blocks = [];
for (const [key, rx, name, blurb, symbol, rgb, dropRx] of CFG) {
  let mined = mine(rx).map(e => ({ ...e, quote: clean(e.quote) })).filter(e => e.quote.length > 3);
  if (dropRx) mined = mined.filter(e => !dropRx.test(e.quote));
  const seen = new Set();
  mined = mined.filter(e => { const k = e.page + '|' + e.quote.slice(0, 40); if (seen.has(k)) return false; seen.add(k); return true; });
  mined.sort((a, b) => a.page - b.page);
  let curated;
  if (CURATED[key] && CURATED[key].length) {
    curated = CURATED[key].map(c => {
      const e = mined.find(x => x.page === c.page);
      return e ? entryLit(e, c.kind, `"${esc(c.note)}"`) : null;
    }).filter(Boolean);
  } else {
    const cIdx = spread(mined, 10);
    curated = cIdx.map((mi, pos) => {
      const kind = pos === 0 || pos === cIdx.length - 1 ? 'definition' : (pos === Math.floor(cIdx.length / 2) ? 'redefinition' : 'mention');
      return entryLit(mined[mi], kind);
    }).filter(Boolean);
  }
  const allE = mined.map(e => entryLit(e, 'mention')).filter(Boolean);
  names.push(key);
  blocks.push(`    static let ${key} = Tower(
        name: "${esc(name)}",
        blurb: "${esc(blurb)}",
        symbol: "${symbol}",
        tint: Color(red: ${rgb[0]}, green: ${rgb[1]}, blue: ${rgb[2]}),
        trajectory: [
${curated.join('\n')}
        ],
        allMentions: [
${allE.join('\n')}
        ]
    )`);
}
// Journals — conceptual, hand-authored, kept at index 2
names.splice(2, 0, 'journals');
blocks.splice(2, 0, `    static let journals = Tower(
        name: "Journals",
        blurb: "How to transcribe — and actually see — all of them (this app is the latest form).",
        symbol: "books.vertical.fill",
        tint: Color(red: 0.35, green: 0.30, blue: 0.55),
        trajectory: [
            TowerEntry(date: "Feb", page: 16, kind: .definition, quote: "finishing making cheat sheets for my journal… that was quite fun last night.", note: "Early method: hand-drawn cheat sheets to index the pages."),
            TowerEntry(date: nil, page: 18, kind: .mention, quote: "make a book of dreams — I found a lot of dreams on scraps of paper in my files.", note: nil),
            TowerEntry(date: nil, page: 18, kind: .redefinition, quote: "I scanned in like 350 papers… scanned through them as one big document, typed some entries in as comments.", note: "The genius-scan + typing pass."),
            TowerEntry(date: "Feb 7", page: 35, kind: .mention, quote: "summarizing the thoughts of months past, and made speedy progress.", note: nil),
        ],
        allMentions: [
            TowerEntry(date: "Feb", page: 16, kind: .mention, quote: "finishing making cheat sheets for my journal… that was quite fun last night.", note: nil),
            TowerEntry(date: nil, page: 18, kind: .mention, quote: "make a book of dreams — I found a lot of dreams on scraps of paper in my files.", note: nil),
            TowerEntry(date: nil, page: 18, kind: .mention, quote: "I scanned in like 350 papers… typed some entries in as comments.", note: nil),
            TowerEntry(date: "Feb 7", page: 35, kind: .mention, quote: "summarizing the thoughts of months past, and made speedy progress.", note: nil),
        ]
    )`);

const file = `import SwiftUI

// AUTO-GENERATED by tools/gen-towers.mjs — do not edit by hand.
// Each tower has a curated Trajectory (a spread across the whole arc) and an
// All-mentions tab (every instance mined from journal_timeline.html), each entry
// linking to its journal page. Regenerate after the corpus grows.

enum TowerEntryKind: String {
    case definition, redefinition, mention, example, imagery
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
        case .definition:   return Color(red: 0.42, green: 0.36, blue: 0.65)
        case .redefinition: return Color(red: 0.16, green: 0.47, blue: 0.77)
        case .mention:      return Color(white: 0.55)
        case .example:      return Color(red: 0.30, green: 0.55, blue: 0.35)
        case .imagery:      return Color(red: 0.80, green: 0.52, blue: 0.24)
        }
    }
}

struct TowerEntry: Identifiable {
    let id = UUID()
    let date: String?
    let page: Int?
    let kind: TowerEntryKind
    let quote: String
    let note: String?
    var inCorpus: Bool = true
}

enum TowerTab: String, CaseIterable, Identifiable {
    case trajectory = "Trajectory"
    case all = "All mentions"
    var id: String { rawValue }
}

struct Tower: Identifiable {
    let id = UUID()
    let name: String
    let blurb: String
    let symbol: String
    let tint: Color
    let trajectory: [TowerEntry]
    let allMentions: [TowerEntry]
    var tabs: [TowerTab] { allMentions.isEmpty ? [.trajectory] : [.trajectory, .all] }
}

enum TowersData {
    static let all: [Tower] = [${names.join(', ')}]

${blocks.join('\n\n')}
}
`;
fs.writeFileSync(OUT, file);
console.log('wrote Tower.swift —', (file.match(/TowerEntry\(/g) || []).length, 'entries across', names.length, 'towers');
