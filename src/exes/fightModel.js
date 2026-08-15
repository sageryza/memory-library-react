// fightModel.js — pure game logic for THE EXES (no Firebase, no DOM, no React).
//
// THE PREMISE (Sophie, Aug 2026): you are NOT in the fight. Two of your exes
// are fighting each other and you are watching. Everything you do is a
// provocation — where you look, and what you do in the room.
//
// So there is no attack button and no health bar for you. There are two dials
// under your hand:
//
//   1. ATTENTION — the only always-on control. You are looking at one of them
//      (or at neither). The one you watch gets PRIDE: he swings harder and
//      guards worse, because he is performing. The one you don't watch gets
//      RAGE: he wants it back. Looking away from both is its own move.
//
//   2. PROVOCATIONS — things you DO in the room, on a ladder from a laugh to
//      throwing a pot to taking your top off. The ladder is ONE-WAY: once you
//      go up a rung the room never settles back down, and the top rungs fire
//      once per fight, ever.
//
// What you're playing for is DRAMA, not a winner. Backing one of them to win
// would make it a fight you're in; the whole point is that they're fighting
// over you, so the score is how much of a scene you caused. A knockout ends
// the fight — it does not "win" it.
//
// A LEVEL IS A SCENARIO (Sophie, Aug 2026): one of them catches you at dinner
// with the other. So a fight is never abstract — it happens somewhere, and the
// room decides two things. It sets who walks in ANGRY and who is already
// sitting there feeling smug (`openers`), and it hands you PROPS — the things
// within reach here that aren't within reach anywhere else. A pot belongs to a
// kitchen; a restaurant gives you a full wine glass and a room full of people
// watching. The universal ladder below travels with you into every level.
//
// The roster (who they are, their dials, their signature line) and the levels
// are both DATA — roster.js and scenarios.js. This file never names anyone and
// never names a room.

// ── tuning ──────────────────────────────────────────────────────────────────
// One place for every constant, so the fight can be re-balanced without
// reading the rules. These are first-pass numbers, tuned by playing.
export const TUNE = {
  composure: 100,     // each fighter's "health" — his ability to keep it together
  beats: 60,          // a fight runs at most this many beats, then it's called
  watchPride: 3,      // pride per beat for the one being watched
  ignoredRage: 2,     // rage per beat for the one being ignored
  bothIgnoredRage: 3, // rage per beat for BOTH when you look at neither
  prideDecay: 1,      // pride bleeds away when you look elsewhere
  rageDecay: 1,       // rage cools when he has your attention
  staminaDrain: 2,    // stamina spent per swing
  swing: 0.15,        // scales a swing into damage — the fight's overall length
  bigHit: 2.5,        // damage worth narrating as a moment
  maxRage: 100,
  maxPride: 100,
};

// ── fighters ────────────────────────────────────────────────────────────────
// A roster entry is: { id, name, ego, temper, stamina, signature }
// ego / temper / stamina are 1..5 dials — how he actually was, turned into
// numbers. They are the only thing that makes one ex fight unlike another.
//
//   ego     — how much your attention changes him (pride gained, guard dropped)
//   temper  — how hard and how wildly he swings when he's angry
//   stamina — whether he's still standing at beat 40
export function makeFighter(def) {
  const dial = (v) => Math.max(1, Math.min(5, Number(v) || 3));
  return {
    id: def.id,
    name: def.name,
    signature: def.signature || null,
    ego: dial(def.ego),
    temper: dial(def.temper),
    stamina: dial(def.stamina),
    // runtime
    composure: TUNE.composure,
    rage: 0,
    pride: 0,
    gas: 100,          // stamina remaining this fight
    usedSignature: false,
  };
}

// ── the provocation ladder ──────────────────────────────────────────────────
// Rung 1 is free and repeatable. Rung 2 costs you the room's temperature.
// Rung 3 fires ONCE and changes the fight permanently.
//
// `target` — 'one' needs a fighter id, 'both' hits the room.
// `heat`   — how far up the ladder the room goes. Never comes back down.
// `once`   — usable one time per fight.
// `cool`   — beats before you can do it again.
//
// The TEXT here is placeholder scaffolding in Sophie's shape, not the final
// list — the real one is hers to write, and the engine doesn't care what any
// of them is called.
export const PROVOCATIONS = [
  // rung 1 — cheap, repeatable
  { id: 'laugh',  rung: 1, target: 'one',  cool: 3, heat: 0,
    label: 'Laugh at his joke',
    effect: { pride: +18, otherRage: +14 } },
  { id: 'phone',  rung: 1, target: 'both', cool: 4, heat: 0,
    label: 'Check your phone',
    effect: { pride: -14, rage: +12 } },
  { id: 'yawn',   rung: 1, target: 'both', cool: 5, heat: 0,
    label: 'Look bored',
    effect: { pride: -20, rage: +8 } },

  // rung 2 — the room changes
  { id: 'name',   rung: 2, target: 'one',  cool: 8, heat: 1,
    label: "Call him the other one's name",
    effect: { pride: -30, rage: +35, otherPride: +20 } },
  { id: 'pot',    rung: 2, target: 'both', cool: 10, heat: 1,
    label: 'Throw a pot',
    effect: { rage: +30, guardBreak: 6 } },
  { id: 'drink',  rung: 2, target: 'one',  cool: 9, heat: 1,
    label: 'Pour your drink on him',
    effect: { rage: +45, pride: -25, otherPride: +15 } },

  // rung 3 — once, and the fight is never the same after
  { id: 'top',    rung: 3, target: 'both', once: true, heat: 2,
    label: 'Start taking your top off',
    effect: { pride: +40, rage: +40, guardBreak: 10 } },
  { id: 'kiss',   rung: 3, target: 'one',  once: true, heat: 2,
    label: 'Kiss him',
    effect: { pride: +60, otherRage: +70, otherGuardBreak: 14 } },
  { id: 'door',   rung: 3, target: 'both', once: true, heat: 2,
    label: 'Walk toward the door',
    effect: { pride: -40, rage: +55 } },
];

// Everything you can do in THIS room: the ladder you always carry, plus the
// props this level put within reach. A prop is an ordinary provocation with a
// `prop: true` flag, so nothing downstream has to care where it came from.
export function hand(state) {
  return [...PROVOCATIONS, ...(state.props || [])];
}

export const provocationById = (id, state) =>
  (state ? hand(state) : PROVOCATIONS).find((p) => p.id === id) || null;

// ── starting a fight ────────────────────────────────────────────────────────
// `scenario` is the level (see scenarios.js) — it may be omitted for a plain
// fight in an empty room, which is what the balance tests use.
export function initFight(defA, defB, scenario = null) {
  const a = makeFighter(defA);
  const b = makeFighter(defB);

  // The room decides who arrives angry. `openers` is keyed by ROLE, and the
  // level says which side holds which role — the one you're with, and the one
  // who walks in on you.
  const open = scenario?.openers || {};
  for (const [side, f] of [['a', a], ['b', b]]) {
    const o = open[side] || {};
    f.rage = clamp(o.rage || 0, 0, TUNE.maxRage);
    f.pride = clamp(o.pride || 0, 0, TUNE.maxPride);
  }

  return {
    beat: 0,
    a,
    b,
    scenario: scenario ? { id: scenario.id, title: scenario.title, setting: scenario.setting } : null,
    props: (scenario?.props || []).map((p) => ({ ...p, prop: true })),
    goal: scenario?.goal || null,   // what this level asks of you, if anything
    attention: null,     // 'a' | 'b' | null — null is looking at neither
    held: 0,             // beats you've held the current attention
    heat: 0,             // how far up the ladder the room has gone (never drops)
    drama: 0,
    used: {},            // provocation id -> beat it was last used
    log: [],             // { beat, kind, text } — what the screen narrates
    over: false,
    downed: null,        // whose composure ran out, if anyone
  };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const other = (side) => (side === 'a' ? 'b' : 'a');

// ── your attention ──────────────────────────────────────────────────────────
// Tapping the man you're already watching looks away from both — so one
// control covers all three states and nothing needs a second button.
export function look(state, side) {
  if (state.over) return state;
  const next = state.attention === side ? null : side;
  return {
    ...state,
    attention: next,
    held: 0,
    log: [...state.log, {
      beat: state.beat,
      kind: 'look',
      text: next ? `You look at ${state[next].name}.` : 'You look at neither of them.',
    }],
  };
}

// ── a provocation ───────────────────────────────────────────────────────────
// Returns state unchanged (plus a refusal in the log) when it isn't available,
// so the UI never has to duplicate the availability rules.
export function canProvoke(state, id) {
  const p = provocationById(id, state);
  if (!p) return { ok: false, why: 'not in this room' };
  if (state.over) return { ok: false, why: 'the fight is over' };
  const last = state.used[id];
  if (p.once && last !== undefined) return { ok: false, why: 'once per fight' };
  if (last !== undefined && state.beat - last < (p.cool || 0)) {
    return { ok: false, why: `${(p.cool || 0) - (state.beat - last)} beats` };
  }
  return { ok: true };
}

export function provoke(state, id, targetSide) {
  const gate = canProvoke(state, id);
  if (!gate.ok) return state;
  const p = provocationById(id, state);

  // 'one' needs a target; default to whoever you're watching.
  const tgt = p.target === 'one' ? (targetSide || state.attention || 'a') : null;
  const e = p.effect || {};
  const next = { ...state, a: { ...state.a }, b: { ...state.b } };

  const applyTo = (side, { pride = 0, rage = 0, guardBreak = 0 }) => {
    const f = next[side];
    f.pride = clamp(f.pride + pride, 0, TUNE.maxPride);
    f.rage = clamp(f.rage + rage, 0, TUNE.maxRage);
    if (guardBreak) f.composure = clamp(f.composure - guardBreak, 0, TUNE.composure);
  };

  if (p.target === 'both') {
    applyTo('a', e);
    applyTo('b', e);
  } else {
    applyTo(tgt, e);
    applyTo(other(tgt), {
      pride: e.otherPride || 0,
      rage: e.otherRage || 0,
      guardBreak: e.otherGuardBreak || 0,
    });
  }

  // The ladder is one-way: the room's heat only ever goes up.
  next.heat = Math.max(state.heat, p.heat || 0);
  next.used = { ...state.used, [id]: state.beat };
  // A provocation is the whole point, so it scores — the higher the rung the
  // more of a scene it is, and a rung you've already been on is worth less.
  const fresh = state.used[id] === undefined ? 1 : 0.4;
  next.drama = state.drama + Math.round((6 + (p.rung || 1) * 14) * fresh);
  next.log = [...state.log, {
    beat: state.beat,
    kind: 'provoke',
    text: p.target === 'one' ? `${p.label} — ${next[tgt].name}.` : p.label + '.',
  }];
  return checkOver(next);
}

// ── one beat of the fight ───────────────────────────────────────────────────
// The fight runs itself. This is what happens while you decide what to do.
export function tick(state, rng = Math.random) {
  if (state.over) return state;
  const next = { ...state, a: { ...state.a }, b: { ...state.b } };
  next.beat = state.beat + 1;
  next.held = state.attention ? state.held + 1 : 0;
  const log = [...state.log];

  // 1. Your attention moves them, every beat, whether or not you do anything.
  for (const side of ['a', 'b']) {
    const f = next[side];
    const watched = state.attention === side;
    if (watched) {
      // Performing for you: pride climbs with his ego, and the anger drains
      // out of him because he's got what he was fighting for.
      f.pride = clamp(f.pride + TUNE.watchPride * (1 + f.ego * 0.3), 0, TUNE.maxPride);
      f.rage = clamp(f.rage - TUNE.rageDecay, 0, TUNE.maxRage);
    } else {
      const rate = state.attention === null ? TUNE.bothIgnoredRage : TUNE.ignoredRage;
      f.rage = clamp(f.rage + rate * (1 + f.ego * 0.2), 0, TUNE.maxRage);
      f.pride = clamp(f.pride - TUNE.prideDecay, 0, TUNE.maxPride);
    }
  }

  // 2. They swing at each other.
  for (const side of ['a', 'b']) {
    const me = next[side];
    const him = next[other(side)];
    if (me.gas <= 0) continue;

    // Rage is what makes him swing; pride is what makes him swing BIG and
    // sloppy. The room's heat multiplies everything — once a pot has been
    // thrown nobody is being careful any more.
    //
    // THE BALANCE THAT MATTERS: two calm men barely dent each other. Baseline
    // power and baseline guard are deliberately about equal, so a fight you
    // don't touch is a sulk. Every bit of real damage traces back to something
    // you did — which is the premise, expressed as arithmetic.
    const wild = 0.8 + rng() * 0.4;
    const power = (6 + me.temper * 1.4)
      * (1 + me.rage / 100)
      * (1 + me.pride / 200)
      * (1 + next.heat * 0.25)
      * wild;

    // Guard: his composure holds unless he's showing off, which is exactly
    // when your attention is on him.
    const guard = (5 + him.stamina * 1.8) * (1 - him.pride / 250);
    const dmg = Math.max(0, (power - guard) * TUNE.swing);

    me.gas = clamp(me.gas - TUNE.staminaDrain * (6 - me.stamina) * 0.5, 0, 100);
    if (dmg > 0) {
      him.composure = clamp(him.composure - dmg, 0, TUNE.composure);
      // A big hit is a moment; a tap isn't.
      if (dmg >= TUNE.bigHit) {
        next.drama += Math.round(dmg);
        log.push({ beat: next.beat, kind: 'hit', text: `${me.name} lands one on ${him.name}.` });
      }
    }

    // His signature fires once, when he's past the point of holding it in.
    if (!me.usedSignature && me.signature && me.rage >= 75) {
      me.usedSignature = true;
      him.composure = clamp(him.composure - (8 + me.temper * 3), 0, TUNE.composure);
      next.drama += 25;
      log.push({ beat: next.beat, kind: 'signature', text: `${me.name}: ${me.signature}` });
    }
  }

  // 3. Ignoring both of them is a provocation in its own right — it costs you
  // nothing and it winds them both up, so it has to score, or the optimal
  // fight is to stare at the wall for sixty beats.
  if (state.attention === null) next.drama += 1;

  next.log = log;
  return checkOver(next);
}

function checkOver(state) {
  const downA = state.a.composure <= 0;
  const downB = state.b.composure <= 0;
  if (!downA && !downB && state.beat < TUNE.beats) return state;
  return {
    ...state,
    over: true,
    // Whoever went down went down. Neither of them wins anything — you do.
    downed: downA && downB ? 'both' : downA ? 'a' : downB ? 'b' : null,
    log: [...state.log, {
      beat: state.beat,
      kind: 'end',
      text: downA || downB ? 'Somebody is on the floor.' : 'They run out of steam.',
    }],
  };
}

// ── your score ──────────────────────────────────────────────────────────────
// Drama accumulated, plus what the room looks like at the end. A fight where
// nobody went down but you went all the way up the ladder still scores.
export function score(state) {
  const damage = (TUNE.composure - state.a.composure) + (TUNE.composure - state.b.composure);
  const rungs = state.heat * 30;
  const knockout = state.downed ? 40 : 0;
  return {
    drama: state.drama,
    damage: Math.round(damage),
    rungs,
    knockout,
    total: Math.round(state.drama + damage * 0.5 + rungs + knockout),
  };
}

// A whole fight with no UI — used by the balance test, and by anything that
// wants to simulate rather than play. `plan` is what you do, keyed by beat:
// [{ beat, look:'a', provoke:'pot', target:'b' }, …]
export function simulate({ a: defA, b: defB, scenario = null, plan = [], rng = Math.random }) {
  let s = initFight(defA, defB, scenario);
  const byBeat = new Map();
  for (const step of plan) byBeat.set(step.beat, step);
  while (!s.over) {
    const step = byBeat.get(s.beat);
    if (step) {
      if (step.look !== undefined) s = look(s, step.look);
      if (step.provoke) s = provoke(s, step.provoke, step.target);
    }
    s = tick(s, rng);
  }
  return s;
}
