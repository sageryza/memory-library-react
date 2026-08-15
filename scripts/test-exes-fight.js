// test-exes-fight.js — the fight model, pure, no network, no DOM.
//   node scripts/test-exes-fight.js
//
// These test the PREMISE, not the numbers: you are not in the fight, your
// attention is a weapon, the ladder only goes up, and doing nothing is boring.
// The tuning constants are expected to move; these assertions should not.

import {
  initFight, look, tick, provoke, canProvoke, score, simulate, hand, TUNE,
} from '../src/exes/fightModel.js';
import { SCENARIOS, scenarioById } from '../src/exes/scenarios.js';

let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
};

// A deterministic rng so a run is reproducible.
const seeded = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const ALEX = { id: 'alex', name: 'Alex', ego: 5, temper: 2, stamina: 3, signature: 'brings up the trip.' };
const BEN  = { id: 'ben',  name: 'Ben',  ego: 2, temper: 5, stamina: 4, signature: 'says he never liked the flat.' };

const run = (n, s, rng) => { for (let i = 0; i < n && !s.over; i++) s = tick(s, rng); return s; };

console.log('\nattention');
{
  let s = initFight(ALEX, BEN);
  s = look(s, 'a');
  s = run(6, s, seeded(1));
  ok(s.a.pride > s.b.pride, 'the one you watch gets prouder than the one you don\'t');
  ok(s.b.rage > s.a.rage, 'the one you ignore gets angrier');

  // Tapping the man you're already watching looks away from both.
  let t = look(initFight(ALEX, BEN), 'a');
  ok(look(t, 'a').attention === null, 'tapping him again looks at neither');

  // Ignoring both is its own provocation, not a rest.
  let both = run(10, initFight(ALEX, BEN), seeded(2));
  ok(both.a.rage > 0 && both.b.rage > 0, 'looking at neither winds up both');
  ok(both.drama > 0, 'looking away scores — staring at the wall is not optimal play');
}

console.log('\nthe ladder only goes up');
{
  let s = initFight(ALEX, BEN);
  s = provoke(s, 'pot');                     // rung 2
  const hot = s.heat;
  ok(hot === 1, 'a rung-2 provocation heats the room');
  s = run(20, s, seeded(3));
  ok(!s.over, 'a hot fight still lasts past 20 beats — if this fails, rebalance TUNE.swing');
  ok(s.heat === hot, 'heat never cools on its own');
  s = provoke(s, 'laugh', 'a');              // rung 1
  ok(s.heat === hot, 'a rung-1 provocation cannot cool the room back down');
  s = provoke(s, 'top');                     // rung 3
  ok(s.heat === 2, 'a rung-3 provocation takes it up again');
}

console.log('\nonce is once');
{
  let s = initFight(ALEX, BEN);
  ok(canProvoke(s, 'top').ok, 'the top comes off once');
  s = provoke(s, 'top');
  ok(!canProvoke(s, 'top').ok, 'and not twice');
  s = run(TUNE.beats, s, seeded(4));
  ok(!canProvoke(s, 'top').ok, 'not even much later');
}

console.log('\ncooldowns');
{
  let s = initFight(ALEX, BEN);
  s = provoke(s, 'laugh', 'a');
  const prideAfterFirst = s.a.pride;
  s = provoke(s, 'laugh', 'a');                       // still cooling
  ok(s.a.pride === prideAfterFirst, 'a provocation on cooldown does nothing');
  s = run(4, s, seeded(5));
  const before = s.a.pride;
  s = provoke(s, 'laugh', 'a');
  ok(s.a.pride > before, 'and works again once it has cooled');
}

console.log('\nthe fight runs itself, and ends');
{
  const s = simulate({ a: ALEX, b: BEN, rng: seeded(6) });
  ok(s.over, 'a fight with no input still finishes');
  ok(s.beat <= TUNE.beats, 'inside the beat limit');
  ok(s.log.some((l) => l.kind === 'hit'), 'they hit each other without being told to');
  ok(s.log.at(-1).kind === 'end', 'the last line is the end of it');
}

console.log('\nprovoking beats watching politely');
{
  const quiet = simulate({ a: ALEX, b: BEN, plan: [{ beat: 0, look: 'a' }], rng: seeded(7) });
  const loud = simulate({
    a: ALEX, b: BEN,
    plan: [
      { beat: 0, look: 'a' },
      { beat: 3, provoke: 'laugh', target: 'a' },
      { beat: 8, provoke: 'pot' },
      { beat: 14, provoke: 'name', target: 'a' },
      { beat: 18, look: 'b' },
      { beat: 22, provoke: 'top' },
      { beat: 30, provoke: 'kiss', target: 'b' },
    ],
    rng: seeded(7),
  });
  ok(score(loud).total > score(quiet).total, 'causing a scene outscores sitting there');
  ok(loud.heat === 2, 'the loud fight went all the way up the ladder');
}

console.log('\nthe room (scenarios)');
{
  const rest = scenarioById('restaurant');
  ok(rest !== null, 'the restaurant exists');

  let s = initFight(ALEX, BEN, rest);
  ok(s.b.rage > s.a.rage, 'the one who walks in on you starts angry');
  ok(s.a.pride > s.b.pride, 'the one you are already with starts smug');

  // Props are only in the room that owns them.
  ok(hand(s).some((p) => p.id === 'glass'), 'the restaurant hands you a wine glass');
  ok(hand(s).some((p) => p.id === 'top'), 'and you still carry the universal ladder in');
  const bare = initFight(ALEX, BEN);
  ok(!hand(bare).some((p) => p.id === 'glass'), 'an empty room has no wine glass');
  ok(!canProvoke(bare, 'glass').ok, 'and refuses to let you throw one');

  // A prop works like any other provocation.
  const before = s.b.rage;
  s = provoke(s, 'glass', 'b');
  ok(s.b.rage > before, 'throwing the wine lands');
  ok(s.heat === 1, 'and heats the room');
}

console.log('\nevery scenario is well-formed');
{
  const ids = new Set();
  let allOk = true, oneGoal = true, rungsOk = true;
  for (const sc of SCENARIOS) {
    if (!sc.id || !sc.title || !sc.setting) allOk = false;
    if (ids.has(sc.id)) allOk = false;
    ids.add(sc.id);
    if (sc.goal && (!sc.goal.label || !sc.goal.target)) oneGoal = false;
    for (const p of sc.props || []) {
      if (!p.id || !p.label || !p.rung) rungsOk = false;
      if (p.rung === 3 && !p.once) rungsOk = false;   // rung 3 is once, always
      if (p.target === 'one' && !p.effect) rungsOk = false;
    }
  }
  ok(allOk, 'every level has an id, a title and a setting, and no id repeats');
  ok(oneGoal, 'every goal has a label and a target');
  ok(rungsOk, 'every prop is well-formed, and every rung-3 prop is once-only');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
