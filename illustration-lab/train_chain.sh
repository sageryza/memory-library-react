#!/bin/bash
# Poll training 1 (no-caption); when it succeeds, launch training 2 (uniform
# captions) into sageryza/sage-diagram-cap, then poll that too.
set -u
SP="/tmp/claude-0/-home-user/fd404207-1f77-5017-b6fe-be163a414045/scratchpad"
T1="z13c0ab6j1rmt0cz4mvae0rr8c"
AUTH="Authorization: Bearer $REPLICATE_API_TOKEN"

status() { curl -s -H "$AUTH" "https://api.replicate.com/v1/trainings/$1" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('status'))"; }

echo "polling training 1: $T1"
while true; do
  S=$(status "$T1")
  echo "$(date -u +%H:%M:%SZ) training1: $S"
  case "$S" in succeeded) break;; failed|canceled) echo "TRAINING1 $S — stopping chain"; exit 1;; esac
  sleep 60
done
echo "TRAINING1 SUCCEEDED"

echo "uploading captioned zip..."
UP=$(curl -s -X POST -H "$AUTH" -F "content=@$SP/batch1/sagediagram-picks-cap.zip;type=application/zip" https://api.replicate.com/v1/files)
FILEURL=$(echo "$UP" | python3 -c "import json,sys; print(json.load(sys.stdin)['urls']['get'])")
echo "cap zip url: $FILEURL"

echo "creating destination sageryza/sage-diagram-cap (ok if exists)..."
curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"owner":"sageryza","name":"sage-diagram-cap","description":"SAGEDIAGRAM style — uniform-caption variant","visibility":"private","hardware":"gpu-h100"}' \
  https://api.replicate.com/v1/models | python3 -c "import json,sys; d=json.load(sys.stdin); print('model:', d.get('name') or d.get('detail'))"

VER=$(curl -s -H "$AUTH" https://api.replicate.com/v1/models/ostris/flux-dev-lora-trainer | python3 -c "import json,sys; print(json.load(sys.stdin)['latest_version']['id'])")
T2=$(curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" -d "{
  \"destination\": \"sageryza/sage-diagram-cap\",
  \"input\": {
    \"input_images\": \"$FILEURL\",
    \"trigger_word\": \"SAGEDIAGRAM\",
    \"steps\": 1500,
    \"lora_rank\": 16,
    \"optimizer\": \"adamw8bit\",
    \"batch_size\": 1,
    \"resolution\": \"512,768,1024\",
    \"autocaption\": false
  }
}" "https://api.replicate.com/v1/models/ostris/flux-dev-lora-trainer/versions/$VER/trainings" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('id',''))")
echo "TRAINING2 LAUNCHED: $T2"

while true; do
  S=$(status "$T2")
  echo "$(date -u +%H:%M:%SZ) training2: $S"
  case "$S" in succeeded) echo "TRAINING2 SUCCEEDED"; exit 0;; failed|canceled) echo "TRAINING2 $S"; exit 1;; esac
  sleep 60
done
