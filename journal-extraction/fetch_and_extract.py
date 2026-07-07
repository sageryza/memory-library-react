#!/usr/bin/env python3
"""Fetch journal PDFs from the cloud, extract drawings for each, and print a
got / missing / duplicate report.

Two input modes:
  1. Manifest URL — a JSON list the JournalReader app writes to Firebase
     Storage: [{"month":"june","name":"june...pdf","size":41231234,"url":"https://…"}]
         python3 fetch_and_extract.py --manifest "https://firebasestorage…/manifest.json"
  2. Explicit links — one or more month=url pairs (e.g. a Dropbox ?dl=1 link):
         python3 fetch_and_extract.py june="https://…?dl=1" july="https://…?dl=1"

For every scan it downloads the PDF, runs batch_month.py, counts cutouts, and
compares against months already extracted under output/. A scan whose size is
LARGER than the one we already processed is treated as "updated" (more pages
added) and re-run; an identical size is skipped as a duplicate.
"""
import sys, os, json, subprocess, urllib.request, hashlib, re

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "output")
STATE = os.path.join(OUT, "_processed.json")          # {month: {size, cutouts, sha1}}
EXPECTED = ["january", "february", "march", "april", "may", "june",
            "july", "august", "september", "october", "november", "december"]
# The backfill we actually care about (user stopped journaling after this):
TARGET = ["june", "july", "august", "september", "october", "november"]

def month_of(name):
    n = name.lower()
    for m in EXPECTED:
        if m in n or m[:3] in n.split():
            return m
    return None

def download(url, dest):
    req = urllib.request.Request(url, headers={"User-Agent": "journal-extract/1.0"})
    with urllib.request.urlopen(req, timeout=300) as r, open(dest, "wb") as f:
        f.write(r.read())
    return os.path.getsize(dest)

def sha1(path, cap=8_000_000):
    h = hashlib.sha1()
    with open(path, "rb") as f:
        h.update(f.read(cap))          # first 8 MB is plenty to fingerprint
    return h.hexdigest()

def load_state():
    return json.load(open(STATE)) if os.path.exists(STATE) else {}

def save_state(s):
    os.makedirs(OUT, exist_ok=True)
    json.dump(s, open(STATE, "w"), indent=2)

def parse_args(argv):
    """Return (manifest_url_or_None, {month: url})."""
    manifest, pairs = None, {}
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--manifest":
            manifest = argv[i + 1]; i += 2; continue
        if "=" in a:
            m, u = a.split("=", 1); pairs[m.lower()] = u
        i += 1
    return manifest, pairs

def scans_from_manifest(url):
    raw = urllib.request.urlopen(urllib.request.Request(
        url, headers={"User-Agent": "journal-extract/1.0"}), timeout=60).read()
    data = json.loads(raw)
    items = data if isinstance(data, list) else data.get("scans", [])
    out = []
    for it in items:
        m = it.get("month") or month_of(it.get("name", ""))
        if m:
            out.append({"month": m, "url": it["url"],
                        "size": int(it.get("size", 0)), "name": it.get("name", m)})
    return out

def main():
    manifest, pairs = parse_args(sys.argv[1:])
    scans = []
    if manifest:
        scans += scans_from_manifest(manifest)
    for m, u in pairs.items():
        scans.append({"month": m, "url": u, "size": 0, "name": m})
    if not scans:
        print(__doc__); sys.exit(1)

    state = load_state()
    tmp = os.path.join(HERE, "_incoming"); os.makedirs(tmp, exist_ok=True)
    got, skipped, updated = [], [], []

    for s in scans:
        m = s["month"]
        pdf = os.path.join(tmp, f"{m}.pdf")
        try:
            size = download(s["url"], pdf)
        except Exception as e:
            print(f"  ✗ {m}: download failed ({e})"); continue
        fp = sha1(pdf)
        prev = state.get(m)
        if prev and prev.get("sha1") == fp:
            skipped.append(m); print(f"  = {m}: identical to what we have — skipped (duplicate)")
            continue
        if prev and size <= prev.get("size", 0):
            skipped.append(m); print(f"  = {m}: not larger than processed ({size} ≤ {prev['size']}) — skipped")
            continue
        tag = m
        odir = os.path.join(OUT, m)
        print(f"  → {m}: extracting ({size:,} bytes{' — LARGER, re-running' if prev else ''})")
        r = subprocess.run([sys.executable, os.path.join(HERE, "batch_month.py"), pdf, odir, tag],
                           capture_output=True, text=True)
        sys.stdout.write(r.stdout)
        if r.returncode != 0:
            print(f"  ✗ {m}: extraction failed\n{r.stderr[-500:]}"); continue
        n = len(os.listdir(os.path.join(odir, "cutouts"))) if os.path.isdir(os.path.join(odir, "cutouts")) else 0
        state[m] = {"size": size, "cutouts": n, "sha1": fp}
        (updated if prev else got).append(m)

    save_state(state)

    # ---- report ----
    have = sorted(state.keys(), key=lambda m: EXPECTED.index(m) if m in EXPECTED else 99)
    missing = [m for m in TARGET if m not in state]
    print("\n" + "=" * 48 + "\nREPORT\n" + "=" * 48)
    print("Got this run:      " + (", ".join(got) or "—"))
    print("Updated (bigger):  " + (", ".join(updated) or "—"))
    print("Skipped duplicate: " + (", ".join(skipped) or "—"))
    print("\nAll months we now have:")
    for m in have:
        print(f"  • {m:10} {state[m]['cutouts']:>4} cutouts   ({state[m]['size']:,} bytes)")
    print("\nStill MISSING (of the June–Nov backfill): " + (", ".join(missing) or "none 🎉"))

if __name__ == "__main__":
    main()
