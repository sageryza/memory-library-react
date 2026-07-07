import pkg from '/home/user/memory-library-react/node_modules/playwright-core/index.js';
const { chromium } = pkg;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
const p = await b.newPage({ viewport:{width:700,height:1000} });
await p.goto('file:///tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad/mock/book.html');
const anim = await p.evaluate(() => getComputedStyle(document.querySelector('.miracles-page')).animationName);
console.log('page animation-name =', anim);
await b.close();
