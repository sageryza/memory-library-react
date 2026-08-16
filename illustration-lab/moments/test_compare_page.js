// Serves the EXACT posted page HTML with the real /compare.css + /compare.js and
// the real injected pill, runs assertions in-page, beacons the verdict back.
const http = require('http'); const fs = require('fs'); const path = require('path');
const os = require('os'); const { spawn } = require('child_process');
const PUB = '/home/user/imageforge/public';
const chrome = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const page = fs.readFileSync('/home/user/memory-library-react/illustration-lab/moments/compare_page.html', 'utf8');
const PILLFILE = '/home/user/imageforge/public/pill-inject.html';
const pill = fs.readFileSync(PILLFILE, 'utf8');

const HARNESS = page.replace('</script>\n', `</script>
<script>
(function(){
  var L=[]; function ok(c,m){ L.push((c?'PASS':'FAIL')+': '+m); }
  var posts=[]; var rf=window.fetch.bind(window);
  window.fetch=function(u,o){ if(o&&o.method==='POST') posts.push(JSON.parse(o.body));
    return rf('/stub'+(String(u).indexOf('?')>-1?'?x=1':''),{}); };
  setTimeout(function(){
    var cards=document.querySelectorAll('.mcard'), boxes=document.querySelectorAll('.vbox');
    ok(cards.length===180,'180 cards ('+cards.length+')');
    ok(boxes.length===360,'two boxes on every card ('+boxes.length+')');
    var f=cards[0], rail=f.querySelector('.rail');
    var rb=rail.getBoundingClientRect();
    ok(rb.right<326,'the boxes are on the LEFT, clear of the pill corner (right edge '+Math.round(rb.right)+' < 326)');
    var yes=f.querySelector('.vbox[data-v=yes]'), no=f.querySelector('.vbox[data-v=no]');
    var col=function(e){return getComputedStyle(e).color;};
    var rest=col(yes);
    ok(rest===col(no)&&rest!=='rgb(192, 97, 74)'&&rest!=='rgb(42, 38, 32)','both start with no colour ('+rest+')');
    var yTop=yes.getBoundingClientRect().top, nTop=no.getBoundingClientRect().top;
    ok(nTop>yTop,'the X sits UNDER the check');
    yes.click();
    ok(col(yes)==='rgb(192, 97, 74)','tapping the check turns it RED ('+col(yes)+')');
    ok(col(no)===rest,'the X stays colourless while the check is lit');
    ok(posts.length===1&&posts[0].ok===true,'the check saved as a coincidence');
    no.click();
    ok(col(no)==='rgb(42, 38, 32)','tapping the X turns it BLACK ('+col(no)+')');
    ok(col(yes)===rest,'the check clears when the X is chosen');
    ok(posts[posts.length-1].ok===false,'the X saved as not-a-coincidence');
    no.click();
    ok(col(no)===rest,'tapping the lit X again clears it back to no colour');
    ok(posts[posts.length-1].ok===null,'clearing saved as no answer');
    ok(f.querySelectorAll('.cmp-note').length===1,'the note + is still on the card');
    var nb=f.querySelector('.cmp-note').getBoundingClientRect();
    ok(nb.top>=rb.top,'the note sits below the row, not as a third column');
    // the pill must survive: its script parses and its play button exists
    ok(!!document.getElementById('vmid'),'the autoscroll pill is intact');
    // a REAL tap is pointerdown then click (a bare .click() never fires the
    // pointerdown that compare.js pauses on) — assert both halves at once:
    // the scroll stops AND the vote still registers through the pause.
    window.__scrollStart&&window.__scrollStart(1);
    var running=!!document.querySelector('.vseg button.on');
    var before=posts.length;
    yes.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
    yes.click();
    ok(running&&!document.querySelector('.vseg button.on'),'a tap on a box pauses the autoscroll');
    ok(posts.length===before+1,'the tap still records the vote through the pause');
    new Image().src='/result?r='+encodeURIComponent(L.join(' | '));
  },600);
})();
</script>
`);
let finish;
const srv = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/result') { res.end('ok'); return finish(decodeURIComponent(new URLSearchParams(req.url.split('?')[1]).get('r')||'')); }
  if (u === '/stub') { res.writeHead(200,{'Content-Type':'application/json'}); return res.end('{"ok":true,"items":{},"texts":{}}'); }
  if (u === '/compare.css' || u === '/compare.js') {
    res.writeHead(200, { 'Content-Type': u.endsWith('css') ? 'text/css' : 'text/javascript' });
    return res.end(fs.readFileSync(path.join(PUB, u.slice(1))));
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(HARNESS.replace('</div>\n<script src="/compare.js">', '</div>\n' + pill + '\n<script src="/compare.js">'));
});
srv.listen(0, '127.0.0.1', () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'jm-'));
  const kid = spawn(chrome, ['--headless', '--no-sandbox', '--disable-gpu', '--window-size=390,844',
    '--user-data-dir=' + profile, `http://127.0.0.1:${srv.address().port}/`], { stdio: 'ignore' });
  const done = (v, err) => { try { kid.kill('SIGKILL'); } catch (_) {} srv.close();
    if (err) { console.error(err); process.exit(1); }
    const lines = v.split(' | ').filter(Boolean); lines.forEach(l => console.log(l));
    if (!lines.length || lines.some(l => l.startsWith('FAIL'))) process.exit(1);
    console.log(`all ${lines.length} checks passed`); process.exit(0); };
  const t = setTimeout(() => done('', 'timed out'), 30000);
  finish = (v) => { clearTimeout(t); done(v); };
});
