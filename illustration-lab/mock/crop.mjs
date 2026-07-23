import pkg from '/home/user/memory-library-react/node_modules/playwright-core/index.js';
const { chromium } = pkg;
const DIR = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad/mock';
const UP = '/root/.claude/uploads/fd404207-1f77-5017-b6fe-be163a414045';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
async function crop(img, clip, out) {
  const p = await b.newPage({ viewport: { width: 2300, height: 2900 }, deviceScaleFactor: 2 });
  await p.setContent(`<body style="margin:0"><img id="i" src="file://${img}" style="display:block"></body>`);
  await p.waitForSelector('#i');
  await p.evaluate(() => { const i=document.getElementById('i'); i.style.width=i.naturalWidth+'px'; });
  await p.screenshot({ path: `${DIR}/${out}`, clip });
  await p.close();
}
await crop(`${UP}/165f4270-IMG_5022.jpeg`, { x: 900, y: 420, width: 900, height: 320 }, 'z-date.png');
await crop(`${UP}/165f4270-IMG_5022.jpeg`, { x: 950, y: 2370, width: 1150, height: 280 }, 'z-footer.png');
await crop(`${UP}/033aafd6-IMG_5069.jpeg`, { x: 250, y: 380, width: 750, height: 750 }, 'z-june12.png');
await b.close();
console.log('cropped ok');
