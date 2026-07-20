#!/usr/bin/env bash
# export-voice-memos.sh — copy your Mac Voice Memos out of their hidden store
# into a folder, named "<date>_<your title>.m4a", and report EXACTLY which
# recordings are still in iCloud (not downloaded) so nothing goes missing.
#
# Reads the Voice Memos database READ-ONLY. It only ever COPIES audio out and
# writes a manifest — it never deletes or changes anything in Voice Memos.
#
# Usage:
#   bash export-voice-memos.sh [destination-folder]
#   (destination defaults to ~/VoiceMemos)
#
# Output in the destination folder:
#   <date>_<title>.m4a   — your recordings, named and dated
#   _manifest.csv        — every recording: filename, title, date, status
#   _missing-in-icloud.txt — the ones NOT downloaded yet (need a download pass)

set -o pipefail

# The DB location (override with VMS_DB=... for testing).
DB="${VMS_DB:-$HOME/Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings/CloudRecordings.db}"
DEST="${1:-$HOME/VoiceMemos}"

if [ ! -f "$DB" ]; then
  echo "Could not find the Voice Memos database at:"
  echo "  $DB"
  echo "Open the Voice Memos app once, then try again."
  exit 1
fi
command -v sqlite3 >/dev/null || { echo "sqlite3 not found (it ships with macOS)."; exit 1; }

RECDIR="$(dirname "$DB")"
mkdir -p "$DEST"
MANIFEST="$DEST/_manifest.csv"
MISSING="$DEST/_missing-in-icloud.txt"
printf 'filename,title,recorded,status,seconds\n' > "$MANIFEST"
: > "$MISSING"

# Query a snapshot (db + WAL) so we never lock the live database.
SNAP="$(mktemp -d)"
cp "$DB" "$SNAP/db" 2>/dev/null
[ -f "$DB-wal" ] && cp "$DB-wal" "$SNAP/db-wal" 2>/dev/null
[ -f "$DB-shm" ] && cp "$DB-shm" "$SNAP/db-shm" 2>/dev/null

# Format a Unix epoch — works with BSD date (macOS: date -r) and GNU date
# (date -d @epoch), in case coreutils is on the PATH via brew.
epoch_fmt() { date -r "$1" +"$2" 2>/dev/null || date -d "@$1" +"$2" 2>/dev/null || echo ""; }

total=0; local_n=0; cloud_n=0

# Use ASCII unit-separator (0x1f), not tab: tab is IFS-whitespace, so empty
# fields (no title / no path) would collapse and shift the columns.
while IFS=$'\x1f' read -r zdate zpath label evict dur; do
  total=$((total + 1))

  # Core Data timestamps count seconds from 2001-01-01; add 978307200 for Unix.
  if [ -n "$zdate" ]; then
    unix=$(awk "BEGIN{printf \"%d\", $zdate + 978307200}")
    recorded=$(epoch_fmt "$unix" "%Y-%m-%d_%H%M"); [ -z "$recorded" ] && recorded="unknown"
    touchstamp=$(epoch_fmt "$unix" "%Y%m%d%H%M.%S")
  else
    recorded="unknown"; touchstamp=""
  fi

  title="$label"; [ -z "$title" ] && title="Recording"
  # Make a filesystem-safe version of the title.
  safe=$(printf '%s' "$title" | tr '/:\\' '___' | tr -cd '[:alnum:] _-' | sed 's/  */ /g' | cut -c1-60)
  [ -z "$safe" ] && safe="Recording"

  src="$RECDIR/$zpath"
  if [ -n "$zpath" ] && [ -f "$src" ]; then
    out="$DEST/${recorded}_${safe}.m4a"
    n=1; base="${out%.m4a}"
    while [ -e "$out" ]; do out="${base}_$n.m4a"; n=$((n + 1)); done
    cp "$src" "$out"
    [ -n "$touchstamp" ] && touch -t "$touchstamp" "$out" 2>/dev/null
    printf '"%s","%s","%s",local,%s\n' "$(basename "$out")" "$title" "$recorded" "$dur" >> "$MANIFEST"
    local_n=$((local_n + 1))
  else
    printf '"%s","%s","%s",IN_ICLOUD,%s\n' "${zpath:-?}" "$title" "$recorded" "$dur" >> "$MANIFEST"
    printf '%s  (%s)  file=%s\n' "$title" "$recorded" "${zpath:-?}" >> "$MISSING"
    cloud_n=$((cloud_n + 1))
  fi
done < <(sqlite3 -separator $'\x1f' "$SNAP/db" \
  "SELECT COALESCE(ZDATE,''), COALESCE(ZPATH,''), COALESCE(ZCUSTOMLABEL,''), COALESCE(ZEVICTIONDATE,''), COALESCE(ZDURATION,0) FROM ZCLOUDRECORDING ORDER BY ZDATE;")

rm -rf "$SNAP"

echo
echo "================ EXPORT SUMMARY ================"
echo "Recordings in database : $total"
echo "Exported (downloaded)  : $local_n   ->  $DEST"
echo "Still in iCloud        : $cloud_n"
echo "Manifest               : $MANIFEST"
[ "$cloud_n" -gt 0 ] && echo "Not-yet-downloaded list: $MISSING"
echo "==============================================="
if [ "$cloud_n" -gt 0 ]; then
  echo
  echo "$cloud_n recording(s) are NOT downloaded to this Mac yet, so they were"
  echo "skipped. Open the Voice Memos app and let them download (scroll through,"
  echo "or play each), then re-run this script — already-exported files are kept."
fi
