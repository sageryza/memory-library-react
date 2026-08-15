// scenarios.js — the LEVELS. One scene each: where you are, which two of them
// are in it, who walks in on what, and what's within reach.
//
// Sophie's shape (Aug 2026): "each level will be a scenario — one of them is
// like your boyfriend catches you at a restaurant with the other guy."
//
// A level is DATA. The engine (fightModel.js) knows nothing about restaurants;
// it reads four fields:
//
//   openers — who starts angry and who starts smug, by side. This is the whole
//             asymmetry of a scene: the man who walks in on you is not in the
//             same state as the man sitting across from you.
//   props   — the provocations this room affords and no other room does. Same
//             shape as the universal ladder in fightModel.js: rung 1 is cheap
//             and repeatable, rung 2 changes the room's temperature, rung 3
//             fires once and can't be taken back.
//   goal    — what the level asks of you, so a scene can be more than "cause a
//             scene". Optional; `null` is a sandbox.
//   cast    — which roster ids fill sides a and b. Left null here on purpose:
//             the roster is Sophie's to write, and the levels shouldn't hold
//             opinions about who was at dinner until she says.
//
// The prose is placeholder scaffolding in her register, not final copy.

export const SCENARIOS = [
  {
    id: 'restaurant',
    title: 'The Restaurant',
    setting: 'A good table, a bad time. You are already sitting down with one of them when the other one walks in.',
    // a = the one you're at dinner with. b = the one who walks in.
    cast: { a: null, b: null },
    openers: {
      a: { pride: 45, rage: 0 },   // smug, has been ordering wine, thinks he's winning
      b: { pride: 0, rage: 55 },   // walked in on it, hasn't sat down
    },
    goal: {
      // A level asks for something beyond drama, so scenes play differently.
      // Here: it's a public room, and the point is how many people watch.
      id: 'scene',
      label: 'Make the whole room look',
      target: 220,
    },
    props: [
      { id: 'wine', rung: 1, target: 'one', cool: 4, heat: 0,
        label: 'Top up his glass',
        effect: { pride: +22, otherRage: +16 } },
      { id: 'menu', rung: 1, target: 'both', cool: 5, heat: 0,
        label: 'Order, slowly, while they wait',
        effect: { pride: -18, rage: +14 } },
      { id: 'waiter', rung: 2, target: 'both', cool: 9, heat: 1,
        label: 'Ask the waiter for a third chair',
        effect: { rage: +28, pride: -20 } },
      { id: 'glass', rung: 2, target: 'one', cool: 10, heat: 1,
        label: 'Throw the wine',
        effect: { rage: +45, pride: -25, otherPride: +18, guardBreak: 5 } },
      { id: 'bill', rung: 3, target: 'one', once: true, heat: 2,
        label: 'Let him pay for both of you',
        effect: { pride: +55, otherRage: +65, otherGuardBreak: 12 } },
      { id: 'table', rung: 3, target: 'both', once: true, heat: 2,
        label: 'Stand on the table',
        effect: { pride: +45, rage: +45, guardBreak: 10 } },
    ],
  },
];

export const scenarioById = (id) => SCENARIOS.find((s) => s.id === id) || null;
