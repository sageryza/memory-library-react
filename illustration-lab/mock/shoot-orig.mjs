import pkg from '/home/user/memory-library-react/node_modules/playwright-core/index.js';
const { chromium } = pkg;
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const DIR = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad/mock';
const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
for (const w of [360, 390, 414]) {
  const page = await browser.newPage({ viewport: { width: w, height: 1400 }, deviceScaleFactor: 2 });
  await page.goto('file://' + DIR + '/book-orig.html', { waitUntil: 'networkidle' });
  const ov = await page.evaluate(() => {
    const el = [...document.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > document.documentElement.clientWidth + 0.5).map(e => e.className).slice(0,6);
    return { scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth, offenders: el };
  });
  console.log('orig @'+w, 'scrollW='+ov.scrollW, 'clientW='+ov.clientW, ov.scrollW>ov.clientW?'OVERFLOW':'ok', '| offenders:', JSON.stringify(ov.offenders));
  if (w===390) await page.screenshot({ path: DIR + '/orig-390.png', fullPage: true });
  await page.close();
}
await browser.close();
