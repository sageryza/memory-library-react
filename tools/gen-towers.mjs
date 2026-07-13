// Regenerate the Towers data by mining every tower's instances from
// journal_timeline.html across the full journal. Writes public/towers/towers.json
// (read by the hosted Towers web page). Curated Trajectory = hand-picked defining
// moments; All-mentions = every instance. Run from the repo root:
//   node tools/gen-towers.mjs
// (Kept OUT of ios-journal/ on purpose, so tower-content edits never trigger an
// app build — only the Firebase Hosting deploy.)
import fs from 'fs';
const HTML = fs.readFileSync(new URL('../ios-journal/JournalReader/journal_timeline.html', import.meta.url), 'utf8');
const OUTJSON = new URL('../public/towers/towers.json', import.meta.url);

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
const trunc = (s, n = 220) => s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s;
const hex = rgb => '#' + rgb.map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
const eObj = (e, kind, note = null) => { const q = trunc(clean(e.quote)); return q ? { date: e.date || null, page: e.page, kind, quote: q, note } : null; };

// key, regex, name, blurb, emoji icon (placeholder for real art), tint rgb, optional drop-regex
const CFG = [
  ['autopro', /auto\s?pro|automatic (program|process)/i, 'AutoPro', 'A self-assigned process you run on yourself — automatic program → process → autopro.', '⚙️', [0.42,0.36,0.65]],
  ['coins', /\bcoins?\b|fungible|nickel/i, 'Coins', 'Coins as the currency of thoughts and ideas.', '🪙', [0.80,0.60,0.20]],
  ['tot', /\bTots?\b|train of thought|pre-?Tot/, 'Train of Thought', 'A train of thought — the unit she captures and collects (a “Tot”).', '🚂', [0.20,0.52,0.52]],
  ['hiddenMechanism', /hidden mechanism/i, 'Hidden Mechanism', 'A concealed structure quietly running the show.', '🧩', [0.20,0.42,0.70]],
  ['tray', /\btray\b/i, 'The Tray', 'A tray to lay thoughts on and find what they share.', '🍽️', [0.34,0.52,0.32]],
  ['newOldThoughts', /new thought|old thought/i, 'New vs Old Thoughts', 'Which thoughts are actually new — and worth keeping.', '💡', [0.70,0.38,0.48]],
  ['instruments', /instrument.{0,15}abstraction|zoom(ing)? in|fine-?tipped/i, 'Instruments of Abstraction', 'Tools for abstracting — and zooming in to see.', '📐', [0.36,0.44,0.55]],
  ['ambiguousEvent', /ambiguous event/i, 'The Ambiguous Event', 'The cornerstone she keeps circling back to.', '❓', [0.45,0.30,0.62]],
  ['competingPatterns', /competing pattern/i, 'Competing Patterns', 'Two things at once — why competing patterns make something richer.', '♊', [0.24,0.50,0.60]],
  ['mapsGame', /\bmaps?\b|mapping|lord of maps/i, 'The Maps Game', 'Drawing maps of the mind — and of other people’s — to see where thoughts live.', '🗺️', [0.42,0.48,0.28], /google maps/i],
  ['stickers', /sticker/i, 'The Stickers Project', 'Making, sorting, and sheeting the stickers.', '🏷️', [0.78,0.45,0.55]],
  ['priming', /priming|cognitive vehicle/i, 'Priming & Cognitive Vehicles', 'How a lead-in conjures a thought before you name it.', '🧠', [0.55,0.35,0.60]],
  ['receipts', /receipt|sugar packet/i, 'Receipts', 'Turning thoughts into receipts and dated little packets.', '🧾', [0.55,0.42,0.28]],
  ['nonAction', /non-?action|fourth quarter/i, 'Non-Action', 'The task you can’t do because it isn’t an action.', '⏸️', [0.40,0.45,0.52]],
  ['innieOutie', /\binnie|\boutie|severance/i, 'Innie / Outie', 'Her Severance-style model of the self at work.', '👥', [0.30,0.34,0.62]],
  ['patternManip', /pattern manipulation/i, 'Pattern Manipulation', 'Proactive and retroactive pattern manipulation.', '🪄', [0.50,0.34,0.58]],
  ['collectingPatterns', /collecting patterns|pattern collector|superficial pattern/i, 'Collecting Patterns', 'The mind’s pattern-collecting habit — which becomes a physical “pattern collector.”', '🧲', [0.30,0.50,0.42]],
  ['metaphorMachine', /metaphor machine|conceptual art|synthetic art/i, 'The Metaphor Machine', 'A machine that molds an object into its meaning.', '🏭', [0.34,0.38,0.60]],
  ['systemsOfMovement', /systems? of movement|\bSOMs?\b/i, 'Systems of Movement', 'SOMs — the moves you can make on a thought: translate, iterate, crop…', '🔀', [0.26,0.44,0.64]],
  ['petitOntologie', /petit ontologie/i, 'Le Petit Ontologie', 'A small, temporary logic invented to justify a given situation.', '⚖️', [0.46,0.36,0.58]],
  ['memoryLibrary', /memory library/i, 'The Memory Library', 'The overarching project — a library of memories in coin envelopes.', '🏛️', [0.50,0.40,0.30]],
  ['duplicitousEnvelope', /duplicitous envelope/i, 'The Duplicitous Envelope', 'An envelope that is two things at once.', '✉️', [0.62,0.48,0.24]],
  ['narrativeTherapy', /narrative therapy/i, 'Narrative Therapy', 'She made it all up — a narrative therapy she designed for herself.', '🪶', [0.66,0.40,0.50]],
  ['twoSidesCoin', /two sides of the same coin/i, 'Two Sides of the Same Coin', 'Two ideas that are secretly the same.', '☯️', [0.40,0.44,0.52]],
];
const spread = (list, n) => {
  if (list.length <= n) return list.map((_, i) => i);
  const idx = []; for (let i = 0; i < n; i++) idx.push(Math.round(i * (list.length - 1) / (n - 1)));
  return [...new Set(idx)];
};

// Hand-curated Trajectory per tower: real defining/evolving moments (by page) + a
// short "what shifted here" note. Quote is pulled from the mined data by page.
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
  collectingPatterns: [
    { page: 13,   kind: 'definition',   note: 'Obsession as a process gone wrong: collecting patterns.' },
    { page: 15,   kind: 'mention',      note: 'A normal process you can deliberately induce.' },
    { page: 320,  kind: 'redefinition', note: 'Becomes a made object — the Pattern Collector.' },
    { page: 364,  kind: 'mention',      note: 'Each matchbox a different pattern to collect.' },
    { page: 451,  kind: 'mention',      note: 'THE PATTERN COLLECTOR.' },
    { page: 529,  kind: 'redefinition', note: 'One of the brain’s main systems of movement.' },
    { page: 1190, kind: 'mention',      note: 'Step one of the updated version.' },
  ],
  metaphorMachine: [
    { page: 9,    kind: 'definition',   note: 'What gets accepted into the metaphor machine.' },
    { page: 30,   kind: 'definition',   note: 'Its basic function: mold an object to extract its meaning.' },
    { page: 20,   kind: 'redefinition', note: 'Conceptual art — running the machine backwards from a concept.' },
    { page: 84,   kind: 'mention',      note: 'Put things in; imagine what they have in common.' },
    { page: 131,  kind: 'redefinition', note: 'Use it to “disappear a thought” by comparing it to what it’s like.' },
    { page: 376,  kind: 'mention',      note: 'The machine is itself a metaphor for automatic processes.' },
    { page: 410,  kind: 'mention',      note: 'A matchbox version instead of the conveyor belt.' },
    { page: 1206, kind: 'mention',      note: 'Still asking: what goes in the metaphor machine?' },
  ],
  systemsOfMovement: [
    { page: 24,   kind: 'definition',   note: 'Game theory: a specific “system of movement” for yourself.' },
    { page: 33,   kind: 'mention',      note: 'Translation is a deceptively useful SOM.' },
    { page: 37,   kind: 'definition',   note: 'Iteration — the last system of movement.' },
    { page: 105,  kind: 'mention',      note: 'Cropping is a system of movement.' },
    { page: 482,  kind: 'mention',      note: 'Games — different systems.' },
    { page: 851,  kind: 'redefinition', note: 'An oscillating system — a common SOM.' },
    { page: 966,  kind: 'definition',   note: 'SOM: what phenomenon is this part of? what’s another example?' },
  ],
  petitOntologie: [
    { page: 1024, kind: 'definition',   note: 'un petit ontologie — a book, an equation.' },
    { page: 1036, kind: 'mention',      note: 'Le Petit Ontologie.' },
    { page: 1039, kind: 'redefinition', note: 'Plug the petit ontologies into the logical extension.' },
    { page: 1047, kind: 'definition',   note: 'Un Petit Ontologie (game).' },
    { page: 1059, kind: 'redefinition', note: 'Its rules start with this journal — constant new shortcuts.' },
    { page: 1131, kind: 'mention',      note: 'Imaginary ontologies, petit ontologies.' },
  ],
  memoryLibrary: [
    { page: 149,  kind: 'definition',   note: 'Filling the memory library with coin envelopes.' },
    { page: 316,  kind: 'mention',      note: 'Restart the project inside the bigger multi-project book.' },
    { page: 318,  kind: 'mention',      note: 'The memories that “help me.”' },
    { page: 366,  kind: 'redefinition', note: 'Xi cards → memories you didn’t know you had → a memory constellation.' },
    { page: 875,  kind: 'mention',      note: 'Post the memory library on reddit.' },
  ],
  duplicitousEnvelope: [
    { page: 563,  kind: 'definition',   note: 'First: criteria list + the duplicitous envelope.' },
    { page: 960,  kind: 'mention',      note: '“the secret is, it’s a duplicitous envelope.”' },
    { page: 1217, kind: 'redefinition', note: 'Another version — strangeness/unnaturalness in common.' },
    { page: 1219, kind: 'mention',      note: 'On the concept poster.' },
  ],
  narrativeTherapy: [
    { page: 208,  kind: 'definition',   note: 'Reorganizing your memory — narrative therapy.' },
    { page: 504,  kind: 'mention',      note: 'The evolving narrative-therapy tool.' },
    { page: 987,  kind: 'definition',   note: '“I designed it — I made up everything.”' },
  ],
  twoSidesCoin: [
    { page: 563,  kind: 'definition',   note: 'Competing patterns & ambiguous events — two sides of the same coin.' },
    { page: 1025, kind: 'mention',      note: 'On the concept poster.' },
    { page: 1219, kind: 'mention',      note: 'Listed again on the poster.' },
  ],
};

const towers = [];
for (const [key, rx, name, blurb, icon, rgb, dropRx] of CFG) {
  let mined = mine(rx).map(e => ({ ...e, quote: clean(e.quote) })).filter(e => e.quote.length > 3);
  if (dropRx) mined = mined.filter(e => !dropRx.test(e.quote));
  const seen = new Set();
  mined = mined.filter(e => { const k = e.page + '|' + e.quote.slice(0, 40); if (seen.has(k)) return false; seen.add(k); return true; });
  mined.sort((a, b) => a.page - b.page);
  let trajectory;
  if (CURATED[key] && CURATED[key].length) {
    trajectory = CURATED[key].map(c => { const e = mined.find(x => x.page === c.page); return e ? eObj(e, c.kind, c.note) : null; }).filter(Boolean);
  } else {
    const cIdx = spread(mined, 10);
    trajectory = cIdx.map((mi, pos) => {
      const kind = pos === 0 || pos === cIdx.length - 1 ? 'definition' : (pos === Math.floor(cIdx.length / 2) ? 'redefinition' : 'mention');
      return eObj(mined[mi], kind);
    }).filter(Boolean);
  }
  const allMentions = mined.map(e => eObj(e, 'mention')).filter(Boolean);
  towers.push({ key, name, blurb, icon, tint: hex(rgb), trajectory, allMentions });
}
// Journals — conceptual, hand-authored, at index 2
towers.splice(2, 0, {
  key: 'journals', name: 'Journals',
  blurb: 'How to transcribe — and actually see — all of them (this app is the latest form).',
  icon: '📚', tint: hex([0.35, 0.30, 0.55]),
  trajectory: [
    { date: 'Feb', page: 16, kind: 'definition', quote: 'finishing making cheat sheets for my journal… that was quite fun last night.', note: 'Early method: hand-drawn cheat sheets to index the pages.' },
    { date: null, page: 18, kind: 'mention', quote: 'make a book of dreams — I found a lot of dreams on scraps of paper in my files.', note: null },
    { date: null, page: 18, kind: 'redefinition', quote: 'I scanned in like 350 papers… scanned through them as one big document, typed some entries in as comments.', note: 'The genius-scan + typing pass.' },
    { date: 'Feb 7', page: 35, kind: 'mention', quote: 'summarizing the thoughts of months past, and made speedy progress.', note: null },
  ],
  allMentions: [
    { date: 'Feb', page: 16, kind: 'mention', quote: 'finishing making cheat sheets for my journal… that was quite fun last night.', note: null },
    { date: null, page: 18, kind: 'mention', quote: 'make a book of dreams — I found a lot of dreams on scraps of paper in my files.', note: null },
    { date: null, page: 18, kind: 'mention', quote: 'I scanned in like 350 papers… typed some entries in as comments.', note: null },
    { date: 'Feb 7', page: 35, kind: 'mention', quote: 'summarizing the thoughts of months past, and made speedy progress.', note: null },
  ],
});

fs.mkdirSync(new URL('../public/towers/', import.meta.url), { recursive: true });
fs.writeFileSync(OUTJSON, JSON.stringify({ note: 'Auto-generated by ios-journal/tools/gen-towers.mjs — do not edit by hand.', towers }, null, 1));
const total = towers.reduce((n, t) => n + t.trajectory.length + t.allMentions.length, 0);
console.log('wrote towers.json —', total, 'entries across', towers.length, 'towers');
