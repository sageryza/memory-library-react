// test-shoebox-paper.js — the Shoebox's per-board paper, no browser needed.
//   node scripts/test-shoebox-paper.js
//
// Three files have to agree about a paper and nothing else notices when
// they drift: papers.js (the list), Shoebox.css (what each one looks like)
// and the file the tile actually lives in. A paper missing its rule renders
// as bare cork, and a rule pointing at a missing webp renders as flat navy
// — both look like "the option didn't work", neither throws.

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { PAPERS, DEFAULT_PAPER, paperOf } from '../src/components/shoebox/papers.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'src/components/shoebox/Shoebox.css'), 'utf8');
const jsx = readFileSync(join(root, 'src/components/shoebox/Shoebox.jsx'), 'utf8');
const hook = readFileSync(join(root, 'src/hooks/useShoeboxState.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
};

console.log('papers');
ok(PAPERS.length >= 2, 'there is more than one paper to choose between');
ok(PAPERS.some((p) => p.id === DEFAULT_PAPER), 'the default is a real paper');
ok(PAPERS[0].id === DEFAULT_PAPER, 'the default is first — paperOf falls back to PAPERS[0]');
ok(new Set(PAPERS.map((p) => p.id)).size === PAPERS.length, 'ids are unique');
ok(new Set(PAPERS.map((p) => p.cls)).size === PAPERS.length, 'classes are unique');

console.log('an unknown paper is cork, never blank');
ok(paperOf('nope').id === DEFAULT_PAPER, 'a paper this build has never heard of');
ok(paperOf(undefined).id === DEFAULT_PAPER, 'a board saved before papers existed');
ok(paperOf('').id === DEFAULT_PAPER, 'an empty string');

console.log('every paper is really painted');
for (const p of PAPERS) {
  ok(css.includes(`.sb-cork.${p.cls}`), `${p.id}: the cork has a rule`);
  ok(css.includes(`.sb-boardwrap.${p.cls}`), `${p.id}: the wall around the board has a rule`);
  ok(css.includes(`.sb-pap.${p.cls}`), `${p.id}: the swatch has a rule`);
  if (p.asset) {
    ok(existsSync(join(root, p.asset)), `${p.id}: ${p.asset} is in the repo`);
    const url = '/' + p.asset.replace(/^public\//, '');
    ok(css.includes(url), `${p.id}: the cork rule points at ${url}`);
  }
}

console.log('the tile can repeat forever');
// A `cover`/`contain` background stretches one copy over the whole board —
// the stars would grow with the board and blur. Papers that carry a tile
// are sized in px and repeat.
for (const p of PAPERS.filter((x) => x.asset)) {
  const rule = css.slice(css.indexOf(`.sb-cork.${p.cls}`)).split('}')[0];
  ok(/repeat/.test(rule) && !/cover|contain/.test(rule), `${p.id}: repeats at a fixed size`);
}

console.log('the board carries its own paper');
ok(/bg:\s*typeof b\.bg/.test(hook), 'normBoard keeps a board\'s bg');
ok(hook.includes('setBoardPaper'), 'the hook exposes setBoardPaper');
ok(/setBoardPaper[\s\S]{0,400}boards: st\.boards\.map/.test(hook), 'it patches ONE board by id, not the current one');
ok(hook.includes('slice(0, 20)'), 'an id is capped rather than trusted');

console.log('the page wires it up');
ok(jsx.includes("from './papers'"), 'the page reads the one paper list');
ok(/className=\{`sb-cork \$\{paper\.cls\}`\}/.test(jsx), 'the cork wears the current board\'s paper');
ok(/sb-boardwrap \$\{paper\.cls\}/.test(jsx), 'so does the wall around it');
ok(jsx.includes('sb-paps'), 'the Boards sheet has a swatch row');
ok(/PAPERS\.map/.test(jsx), 'the swatches come from the list, nothing is hardcoded');
ok(/setBoardPaper\(b\.id, pp\.id\)/.test(jsx), 'a swatch sets THAT row\'s board, not the open one');
// A swatch inside .sb-boardpick would be a button in a button: invalid, and
// the tap would fall through to switching boards.
// The New board row leads the sheet now, so this window has to end at
// what follows the board list, never at 'sb-newboard' (a backwards
// slice is an empty string, and every assertion under it passes
// vacuously while saying nothing).
const boardsStart = jsx.indexOf('sb-boardrow');
const sheet = jsx.slice(boardsStart, jsx.indexOf('sb-detail', boardsStart));
const pickBlock = sheet.slice(sheet.indexOf('sb-boardpick'), sheet.indexOf('</button>'));
ok(!pickBlock.includes('sb-pap'), 'a swatch is a sibling of the board button, never inside it');
ok(sheet.includes('sb-boardline'), 'the name/delete line is its own row above the swatches');

// Making a board is what she opens this sheet for; at the foot it sat behind
// every board she already had, and with several boards it was off screen
// (Sophie, 2026-08-29: "new board shud be at the top"). The sheet is a plain
// vertical flow with no ordering CSS, so document order IS what she sees.
console.log('New board leads the sheet');
ok(sheet.length > 0, 'the board-list window is a real slice, not an empty one');
ok(jsx.indexOf('sb-newboard') < jsx.indexOf('sb-boardrow'), 'the New board row comes before the first board');
ok(jsx.indexOf('<h2>Boards</h2>') < jsx.indexOf('sb-newboard'), 'the heading is still first');
ok(/\.sb-newboard \{[^}]*margin: 0 0 /.test(css), 'it pushes the boards down, never itself down');
const sheetCss = css.slice(css.indexOf('.sb-boards {'), css.indexOf('.sb-boards {') + 400);
ok(!/column-reverse|(^|[;{\s])order\s*:/.test(sheetCss), 'nothing re-orders the sheet in CSS');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
