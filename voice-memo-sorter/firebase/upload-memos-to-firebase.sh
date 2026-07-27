#!/usr/bin/env bash
# Upload your voice memos + manifest to Firebase Storage (project membry-df528).
# Prereqs: Google Cloud SDK (gcloud/gsutil) and you logged in once:
#     brew install --cask google-cloud-sdk   # if not installed
#     gcloud auth login                        # opens a browser once
#
# Run:  bash upload-memos-to-firebase.sh
set -euo pipefail

BUCKET="${BUCKET:-membry-df528.firebasestorage.app}"
SRC="${VOICEMEMOS:-$HOME/VoiceMemos}"
MANIFEST="${MANIFEST:-$(dirname "$0")/memo-audio-manifest.json}"
DEST="gs://$BUCKET/memo-audio"

echo "→ Bucket:   $DEST"
echo "→ Memos:    $SRC"
echo "→ Manifest: $MANIFEST"
echo

# pick an uploader
if command -v gcloud >/dev/null 2>&1; then UP=(gcloud storage cp); LS=(gcloud storage ls)
elif command -v gsutil >/dev/null 2>&1; then UP=(gsutil -m cp); LS=(gsutil ls)
else
  echo "❌ Need Google Cloud SDK. Install:  brew install --cask google-cloud-sdk"
  echo "   then:  gcloud auth login"
  exit 1
fi

# sanity checks
[ -d "$SRC" ]      || { echo "❌ No folder $SRC — where are your exported .m4a files?"; exit 1; }
[ -f "$MANIFEST" ] || { echo "❌ Manifest not found at $MANIFEST (put it next to this script)"; exit 1; }
COUNT=$(ls -1 "$SRC"/*.m4a 2>/dev/null | wc -l | tr -d ' ')
[ "$COUNT" -gt 0 ] || { echo "❌ No .m4a files in $SRC"; exit 1; }

echo "Checking access to the bucket…"
if ! "${LS[@]}" "gs://$BUCKET" >/dev/null 2>&1; then
  echo "❌ Can't reach gs://$BUCKET. Are you logged in? Try:  gcloud auth login"
  echo "   (If the bucket name is wrong, re-run with:  BUCKET=membry-df528.appspot.com bash $0 )"
  exit 1
fi

echo "Uploading $COUNT recordings (this can take a while on big batches)…"
if [ "${UP[0]}" = "gcloud" ]; then
  gcloud storage cp "$SRC"/*.m4a "$DEST/"
else
  gsutil -m cp "$SRC"/*.m4a "$DEST/"
fi

echo "Uploading manifest…"
"${UP[@]}" "$MANIFEST" "$DEST/manifest.json"

echo
echo "✅ Done. $COUNT recordings + manifest are in $DEST"
echo "   Tell Claude it's uploaded and I'll wire the apps to read them."
