import pkg from '/home/user/memory-library-react/node_modules/playwright-core/index.js';
const { chromium } = pkg;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
const p = await b.newPage({ viewport:{width:700,height:1000} });
await p.goto('file:///tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad/mock/book.html');
const res = await p.evaluate(() => {
  const el = document.querySelector('.miracles-page');
  const back = { name: getComputedStyle(el).animationName, origin: getComputedStyle(el).transformOrigin };
  el.classList.add('turn-fwd');
  const fwd = { name: getComputedStyle(el).animationName, origin: getComputedStyle(el).transformOrigin };
  return { back, fwd };
});
console.log('default(back):', JSON.stringify(res.back));
console.log('turn-fwd:     ', JSON.stringify(res.fwd));
await b.close();
