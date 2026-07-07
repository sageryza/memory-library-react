import extract as E, os, glob, json, base64, io, shutil, subprocess, sys
import numpy as np, cv2
from PIL import Image
from concurrent.futures import ThreadPoolExecutor, as_completed

# Usage: python3 batch_month.py <pdf_path> <out_dir> <tag>
PDF, OUT, TAG = sys.argv[1], sys.argv[2], sys.argv[3]
E.doc = __import__("fitz").open(PDF)
doc = E.doc; N = doc.page_count
os.makedirs(OUT, exist_ok=True)
CACHE = os.path.join(OUT, "_det_cache.json")
cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}

def detect_cached(i):
    k = str(i)
    if k in cache: return cache[k]
    boxes = E.detect(E.hires(i))
    cache[k] = boxes
    return boxes

# 1) detect (cached) — only pages missing from cache hit the API
missing = [i for i in range(N) if str(i) not in cache]
if missing:
    with ThreadPoolExecutor(max_workers=6) as ex:
        for i, r in zip(missing, ex.map(lambda i: (i, E.detect(E.hires(i))), missing)):
            cache[str(r[0])] = r[1]
    json.dump(cache, open(CACHE, "w"))
print(f"detections: {sum(len(v) for v in cache.values())} boxes across {N} pages (api calls this run: {len(missing)})")

# 2) extract cutouts in current style
raw = os.path.join(OUT, "raw"); os.makedirs(raw, exist_ok=True)
for f in glob.glob(raw+"/*.png"): os.remove(f)
def work(i):
    rgb = E.hires(i); out = 0
    for j, d in enumerate(cache[str(i)]):
        b = d.get("box")
        if not b or len(b) != 4: continue
        t = E.tighten(rgb, b)
        if not t: continue
        E.cutout(t[0], declutter=True).save(f"{raw}/{TAG}_p{i:02d}_{j}.png"); out += 1
    return out
with ThreadPoolExecutor(max_workers=6) as ex:
    total = sum(ex.map(work, range(N)))
print("cutouts:", total)

# 3) dedupe within page by ink IoU
def page_of(f): return int(os.path.basename(f).split("_p")[1].split("_")[0])
def sig(f, S=96):
    g = cv2.cvtColor(np.array(Image.open(f).convert("RGB")), cv2.COLOR_RGB2GRAY)
    ink = g < 160                                   # dark = ink; paper is bright
    ys, xs = np.where(ink)
    if len(xs) < 20: return None, 0
    c = (ink[ys.min():ys.max()+1, xs.min():xs.max()+1]).astype(np.uint8) * 255
    return (np.array(Image.fromarray(c).resize((S, S))) > 40), int(ink.sum())
files = sorted(glob.glob(raw+"/*.png"), key=lambda f: (page_of(f), f))
S = {f: sig(f) for f in files}; files = [f for f in files if S[f][0] is not None]
def iou(a, b): u = (a | b).sum(); return (a & b).sum()/u if u else 0
drop = set(); bypg = {}
for f in files: bypg.setdefault(page_of(f), []).append(f)
for fs in bypg.values():
    for i in range(len(fs)):
        if fs[i] in drop: continue
        for j in range(i+1, len(fs)):
            if fs[j] not in drop and iou(S[fs[i]][0], S[fs[j]][0]) > 0.55:
                drop.add(fs[j] if S[fs[i]][1] >= S[fs[j]][1] else fs[i])
keep = [f for f in files if f not in drop]
ded = os.path.join(OUT, "cutouts"); os.makedirs(ded, exist_ok=True)
for f in glob.glob(ded+"/*.png"): os.remove(f)
for f in keep: shutil.copy(f, ded+"/"+os.path.basename(f))
print(f"kept {len(keep)} (dropped {len(drop)} dupes)")

# 4) HQ self-contained gallery
def tb(f, box=560):
    im = Image.open(f).convert("RGBA"); im.thumbnail((box, box), Image.LANCZOS)
    bg = Image.new("RGBA", im.size, (255, 255, 255, 255)); bg.alpha_composite(im)
    buf = io.BytesIO(); bg.convert("RGB").save(buf, "PNG")
    return base64.b64encode(buf.getvalue()).decode()
cells = "".join(f'<figure><img loading=lazy src="data:image/png;base64,{tb(f)}"/>'
                f'<figcaption>{os.path.basename(f).replace(TAG+"_","").replace(".png","")}</figcaption></figure>' for f in keep)
html = (f"<!doctype html><meta charset=utf8><title>{TAG} drawings</title>"
        "<style>body{font:14px/1.4 -apple-system,system-ui,sans-serif;background:#f6f3ec;margin:0;padding:16px;color:#333}"
        ".grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}"
        "figure{margin:0;background:#fff;border:1px solid #e5ddcb;border-radius:8px;padding:10px;text-align:center}"
        "img{width:100%;height:230px;object-fit:contain}figcaption{color:#a08b5e;font-size:11px;margin-top:6px}</style>"
        f"<h1>{TAG} — {len(keep)} drawings</h1><div class=grid>{cells}</div>")
open(os.path.join(OUT, f"{TAG}_gallery.html"), "w").write(html)

# 5) zip full-res cutouts
z = os.path.join(OUT, f"{TAG}_drawings.zip")
if os.path.exists(z): os.remove(z)
subprocess.run(["zip", "-q", "-r", os.path.basename(z), "cutouts"], cwd=OUT)
print("done:", z)
