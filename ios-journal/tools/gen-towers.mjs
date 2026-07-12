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

const names = [], blocks = [];
for (const [key, rx, name, blurb, symbol, rgb, dropRx] of CFG) {
  let mined = mine(rx).map(e => ({ ...e, quote: clean(e.quote) })).filter(e => e.quote.length > 3);
  if (dropRx) mined = mined.filter(e => !dropRx.test(e.quote));
  const seen = new Set();
  mined = mined.filter(e => { const k = e.page + '|' + e.quote.slice(0, 40); if (seen.has(k)) return false; seen.add(k); return true; });
  mined.sort((a, b) => a.page - b.page);
  const cIdx = spread(mined, 10);
  const curated = cIdx.map((mi, pos) => {
    const kind = pos === 0 || pos === cIdx.length - 1 ? 'definition' : (pos === Math.floor(cIdx.length / 2) ? 'redefinition' : 'mention');
    return entryLit(mined[mi], kind);
  }).filter(Boolean);
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
