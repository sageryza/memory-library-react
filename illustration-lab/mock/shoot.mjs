import pkg from '/home/user/memory-library-react/node_modules/playwright-core/index.js';
const { chromium } = pkg;

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const DIR = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad/mock';

const shots = [
  { file: 'book.html',  vp: { width: 390, height: 1500 }, out: 'rb-mobile390.png' },
  { file: 'book.html',  vp: { width: 360, height: 1500 }, out: 'rb-mobile360.png' },
  { file: 'book.html',  vp: { width: 700, height: 1200 }, out: 'rb-desktop.png' },
  { file: 'cover.html', vp: { width: 420, height: 760 },  out: 'rb-cover.png' },
];

const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
for (const s of shots) {
  const page = await browser.newPage({ viewport: s.vp, deviceScaleFactor: 2 });
  await page.goto('file://' + DIR + '/' + s.file, { waitUntil: 'networkidle' });
  // report whether the document overflows its own viewport horizontally
  const ov = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  console.log(s.out, 'scrollW=' + ov.scrollW, 'clientW=' + ov.clientW,
    ov.scrollW > ov.clientW ? 'OVERFLOW' : 'ok');
  await page.screenshot({ path: DIR + '/' + s.out, fullPage: true });
  await page.close();
}
await browser.close();
console.log('done');
