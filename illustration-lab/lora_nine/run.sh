#!/bin/bash
set -u
SP="/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad"; VER="728090b893932ee0de9d42ee76f25a95ada1547d67ef22901b62b0585a1a2866"
AUTH="Authorization: Bearer $REPLICATE_API_TOKEN"
declare -A IDS
while IFS=':' read -r k id; do IDS[$k]="$id"; done < "$SP/lora_nine/ids.txt"
declare -A CONC
while IFS='|' read -r k c; do CONC[$k]="$c"; done < "$SP/lora_nine/concepts.txt"
# retry any empty ids (rate limit) with backoff
for k in "${!CONC[@]}"; do
  if [ -z "${IDS[$k]:-}" ]; then
    for t in 1 2 3 4 5; do
      sleep 15
      ID=$(curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" -d "{\"version\":\"$VER\",\"input\":{\"prompt\":\"SAGEDIAGRAM, ${CONC[$k]}, a simple hand-drawn doodle, thin black pen line on a plain white background, minimal, no color\",\"num_outputs\":1,\"output_format\":\"webp\",\"go_fast\":false}}" https://api.replicate.com/v1/predictions | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))")
      [ -n "$ID" ] && { IDS[$k]="$ID"; echo "retry $k ok: $ID"; break; }
    done
  fi
done
for k in "${!IDS[@]}"; do
  id="${IDS[$k]}"; [ -z "$id" ] && { echo "$k: NO ID"; continue; }
  for i in $(seq 1 50); do
    R=$(curl -s -H "$AUTH" "https://api.replicate.com/v1/predictions/$id")
    S=$(echo "$R" | python3 -c "import json,sys; print(json.load(sys.stdin).get('status'))")
    if [ "$S" = "succeeded" ]; then
      URL=$(echo "$R" | python3 -c "import json,sys; o=json.load(sys.stdin).get('output'); print(o[0] if isinstance(o,list) else o)")
      curl -sL "$URL" -o "$SP/lora_nine/$k.webp"; echo "$k: done"; break
    fi
    [ "$S" = "failed" ] && { echo "$k: FAILED"; break; }
    sleep 5
  done
done
node - <<'NODE'
const { createRequire } = require('module');
const sharp = createRequire('/home/user/memory-library-react/functions/')('sharp');
const fs = require('fs');
const SP = '/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad/lora_nine';
(async () => {
  const order = fs.readFileSync(`${SP}/concepts.txt`,'utf8').trim().split('\n').map(l => l.split('|'));
  const CELL = 340, LBL = 24;
  const comp = [];
  for (let i = 0; i < order.length; i++) {
    const [k, c] = order[i];
    const col = i % 3, row = Math.floor(i / 3);
    try {
      const img = await sharp(`${SP}/${k}.webp`).resize(CELL - 6, CELL - 6 - LBL, { fit: 'contain', background: '#fff' }).toBuffer();
      comp.push({ input: img, left: col * CELL + 3, top: row * CELL + 3 });
    } catch {}
    const esc = c.replace(/&/g,'&amp;').replace(/</g,'&lt;');
    comp.push({ input: Buffer.from(`<svg width="${CELL}" height="${LBL}"><rect width="${CELL}" height="${LBL}" fill="#f4efe6"/><text x="6" y="16" font-family="sans-serif" font-size="11" fill="#333">${esc.slice(0,58)}</text></svg>`), left: col * CELL, top: row * CELL + CELL - LBL });
  }
  await sharp({ create: { width: 3 * CELL, height: 3 * CELL, channels: 3, background: '#fff' } }).composite(comp).png().toFile(`${SP}/nine_grid.png`);
  console.log('NINE GRID DONE');
})();
NODE
