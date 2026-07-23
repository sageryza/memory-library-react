#!/bin/bash
set -u
SP="/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad"
AUTH="Authorization: Bearer $REPLICATE_API_TOKEN"
VER=$(curl -s -H "$AUTH" https://api.replicate.com/v1/models/sageryza/sage-diagram-lbl | python3 -c "import json,sys; print(json.load(sys.stdin)['latest_version']['id'])")
echo "lbl version: ${VER:0:16}..."
mkdir -p "$SP/lora_test_lbl"
declare -A C=( [cake]='a birthday cake with a small CLOSED sign hanging on it' [capsule]='a cracked-open toy capsule with a tiny stack of pancakes inside' [water]='a glass of water with a small halo floating above it' )
declare -A IDS
for k in cake capsule water; do
  IDS[$k]=$(curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" -d "{\"version\":\"$VER\",\"input\":{\"prompt\":\"SAGEDIAGRAM, ${C[$k]}, a simple hand-drawn doodle, thin black pen line on a plain white background, minimal, no color\",\"num_outputs\":1,\"output_format\":\"webp\",\"go_fast\":false}}" https://api.replicate.com/v1/predictions | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))")
  echo "$k: ${IDS[$k]}"
done
for k in cake capsule water; do
  for i in $(seq 1 40); do
    R=$(curl -s -H "$AUTH" "https://api.replicate.com/v1/predictions/${IDS[$k]}")
    S=$(echo "$R" | python3 -c "import json,sys; print(json.load(sys.stdin).get('status'))")
    if [ "$S" = "succeeded" ]; then
      URL=$(echo "$R" | python3 -c "import json,sys; o=json.load(sys.stdin).get('output'); print(o[0] if isinstance(o,list) else o)")
      curl -sL "$URL" -o "$SP/lora_test_lbl/$k.webp"
      node -e "require('/home/user/memory-library-react/functions/node_modules/sharp')('$SP/lora_test_lbl/$k.webp').png().toFile('$SP/lora_test_lbl/$k.png')"
      echo "$k: done"; break
    fi
    [ "$S" = "failed" ] && { echo "$k: FAILED"; break; }
    sleep 5
  done
done
node "$SP/build_grid.mjs"
