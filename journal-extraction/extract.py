import fitz, base64, io, json, os, re, requests
import numpy as np, cv2
from PIL import Image

# The January one-off ran with a hardcoded PDF at import time; batch_month.py
# (and any other importer) now sets `E.doc = fitz.open(path)` itself, so only
# open the default when it actually exists (running this file directly).
PDF = "jan/january 3 '26 -.pdf"
KEY = os.environ["OPENAI_API_KEY"]
doc = None
if os.path.exists(PDF):
    doc = fitz.open(PDF)
    os.makedirs("jan/cutouts", exist_ok=True)
    os.makedirs("jan/overlays", exist_ok=True)

def hires(i, dpi=220):
    pix = doc[i].get_pixmap(dpi=dpi)
    arr = np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width, pix.n)
    return arr[:, :, :3].copy()  # RGB

def detect(rgb):
    img = Image.fromarray(rgb)
    w, h = img.size; s = 1200 / max(w, h)
    small = img.resize((int(w*s), int(h*s)))
    buf = io.BytesIO(); small.save(buf, "JPEG", quality=85)
    b64 = base64.b64encode(buf.getvalue()).decode()
    prompt = ("This is a scanned page from a handwritten journal (black ink on cream paper). "
      "Identify the DRAWINGS (illustrations, diagrams, doodles, boxed sketches) — NOT paragraphs of handwriting. "
      "For each drawing give a bounding box [x0,y0,x1,y1] normalized 0..1 (origin top-left). "
      "Make the box GENEROUS: include the ENTIRE drawing edge-to-edge plus any hand-drawn frame and any "
      "title/caption text that is part of the drawing. It's better to include a little extra margin than to "
      "clip any part of the drawing. Ignore trivial marks smaller than a few words. Add a short label. "
      "DO NOT return a box for any of these — they are NOT drawings: "
      "(1) a region that is only handwritten WORDS or text, even a single word or a short label with no picture; "
      "(2) the notebook's SPIRAL BINDING — the row of metal wire-coil loops running down the left or right edge "
      "of the page (it scans as a vertical strip of grey/black repeating rings); never box the binding on its own. "
      "Only box a region if it clearly contains an actual picture/sketch. "
      'Return STRICT JSON only: {"drawings":[{"box":[x0,y0,x1,y1],"label":"..."}]}  (empty list if none).')
    r = requests.post("https://api.openai.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {KEY}"},
        json={"model": "gpt-4o", "temperature": 0, "max_tokens": 700,
              "messages": [{"role": "user", "content": [
                  {"type": "text", "text": prompt},
                  {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}}]}]},
        timeout=120)
    r.raise_for_status()
    txt = r.json()["choices"][0]["message"]["content"]
    txt = re.sub(r"^```(json)?|```$", "", txt.strip(), flags=re.M).strip()
    try:
        return json.loads(txt).get("drawings", [])
    except Exception:
        return []

def ink_mask(gray):
    # ink = dark; Otsu on inverted so ink -> 255
    _, m = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    return m

def _blob(region):
    """Ink components in a region; returns (n, stats, centroids, index-of-largest)."""
    gray = cv2.cvtColor(region, cv2.COLOR_RGB2GRAY)
    m = cv2.medianBlur(ink_mask(gray), 3)
    k = max(9, int(0.02*max(region.shape[:2])) | 1)
    dil = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    n, _, stats, cent = cv2.connectedComponentsWithStats(dil, 8)
    if n <= 1: return None
    big = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    return n, stats, cent, big

def tighten(rgb, box, pad_frac=0.12):
    H, W = rgb.shape[:2]
    x0, y0, x1, y1 = box
    mx, my = (x1-x0)*pad_frac, (y1-y0)*pad_frac
    X0 = max(0, int((x0-mx)*W)); Y0 = max(0, int((y0-my)*H))
    X1 = min(W, int((x1+mx)*W)); Y1 = min(H, int((y1+my)*H))
    # Grow the region outward while the drawing blob runs into a region edge that
    # isn't the page edge — so a too-tight vision box can't clip the drawing.
    region = None
    for _ in range(5):
        if X1-X0 < 20 or Y1-Y0 < 20: return None
        region = rgb[Y0:Y1, X0:X1]
        r = _blob(region)
        if not r: return None
        n, stats, cent, big = r
        bx, by = stats[big, cv2.CC_STAT_LEFT], stats[big, cv2.CC_STAT_TOP]
        bw, bh = stats[big, cv2.CC_STAT_WIDTH], stats[big, cv2.CC_STAT_HEIGHT]
        grew = False; gx, gy = int(0.10*W), int(0.10*H)
        if bx <= 2 and X0 > 0:                       X0 = max(0, X0-gx); grew = True
        if by <= 2 and Y0 > 0:                       Y0 = max(0, Y0-gy); grew = True
        if bx+bw >= region.shape[1]-2 and X1 < W:    X1 = min(W, X1+gx); grew = True
        if by+bh >= region.shape[0]-2 and Y1 < H:    Y1 = min(H, Y1+gy); grew = True
        if not grew: break
    areas = stats[1:, cv2.CC_STAT_AREA]
    # Drop trivial detections (tiny doodles / slivers) based on the drawing itself.
    if bw < 0.06*W or bh < 0.045*H: return None
    # Anchor to the drawing's box, then include only OTHER ink whose centroid falls
    # INSIDE that box (interior detail, a frame's title) — this keeps the drawing
    # whole while excluding handwriting sitting beside it.
    ex, ey = 0.06*bw, 0.06*bh
    ax0, ay0, ax1, ay1 = bx-ex, by-ey, bx+bw+ex, by+bh+ey
    xs0, ys0, xs1, ys1 = bx, by, bx+bw, by+bh
    for i in range(1, n):
        if i == big or stats[i, cv2.CC_STAT_AREA] < 0.01*areas.max(): continue
        cxp, cyp = cent[i]
        if ax0 <= cxp <= ax1 and ay0 <= cyp <= ay1:
            xs0 = min(xs0, stats[i, cv2.CC_STAT_LEFT]); ys0 = min(ys0, stats[i, cv2.CC_STAT_TOP])
            xs1 = max(xs1, stats[i, cv2.CC_STAT_LEFT]+stats[i, cv2.CC_STAT_WIDTH])
            ys1 = max(ys1, stats[i, cv2.CC_STAT_TOP]+stats[i, cv2.CC_STAT_HEIGHT])
    p = int(0.03*max(xs1-xs0, ys1-ys0))
    cx0, cy0 = max(0, int(xs0)-p), max(0, int(ys0)-p)
    cx1, cy1 = min(region.shape[1], int(xs1)+p), min(region.shape[0], int(ys1)+p)
    crop = region[cy0:cy1, cx0:cx1]
    abs_box = (X0+cx0, Y0+cy0, X0+cx1, Y0+cy1)
    return crop, abs_box

def erase_binding(crop):
    """Detect the notebook's spiral-binding coil hugging a vertical edge and
    erase just it. Returns (out_rgb, fired). Conservative: only fires when an
    edge strip holds a tall, periodic, grey column (the metal wire loops), and
    only erases ink components that live in that strip — never strokes that
    reach into the drawing. Handles the coil on the left OR the right margin."""
    gray = cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY)
    thr, _ = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    ink = gray < thr
    H, W = gray.shape
    strip_w = max(8, int(0.14 * W))
    best = None
    for side in ("L", "R"):
        sx0, sx1 = (0, strip_w) if side == "L" else (W - strip_w, W)
        strip = ink[:, sx0:sx1]
        rows_cov = (strip.sum(axis=1) > 0).mean()              # coil spans most of the height
        if rows_cov < 0.5:
            continue
        prof = strip.sum(axis=1).astype(float); prof -= prof.mean()
        ac = np.correlate(prof, prof, "full")[len(prof)-1:]
        ac = ac / (ac[0] + 1e-9)
        lo, hi = max(8, int(0.02*H)), max(12, int(0.20*H))
        peak = float(ac[lo:hi].max()) if hi > lo else 0.0      # regular coil pitch
        dvals = gray[:, sx0:sx1][strip]
        grey = float(np.median(dvals)) if len(dvals) else 0.0  # metal scans mid-grey
        if peak > 0.33 and rows_cov > 0.5 and grey > 55:
            score = rows_cov * peak
            if not best or score > best[0]:
                best = (score, sx0, sx1, side)
    if not best:
        return crop, False
    _, sx0, sx1, side = best
    n, lab, stats, _ = cv2.connectedComponentsWithStats(ink.astype(np.uint8), 8)
    mask = np.zeros((H, W), np.uint8)
    reach = int(strip_w * 1.6)                                 # how far a coil ring may extend inward
    for i in range(1, n):
        x, w = stats[i, cv2.CC_STAT_LEFT], stats[i, cv2.CC_STAT_WIDTH]
        inside = (x >= sx0 - 2 and x + w <= sx0 + reach) if side == "L" \
                 else (x + w <= sx1 + 2 and x >= sx1 - reach)
        if inside:
            mask[lab == i] = 255
    mask = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
    out = crop.copy()
    paper = crop[gray >= thr]
    fill = np.median(paper, axis=0).astype(np.uint8) if len(paper) else np.array([255,255,255], np.uint8)
    out[mask > 0] = fill
    return out, True

def cutout(crop, declutter=True):
    # Leave the crop exactly as scanned (natural paper, ink tone, speckles). The
    # ONLY changes are erasing the stray handwriting beside the drawing and the
    # spiral binding coil at the page edge — painting just those marks back to
    # the paper colour, nothing else touched.
    crop, _ = erase_binding(crop)
    out = crop.copy()
    if declutter:
        gray = cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY)
        thr, _ = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        ink = (gray < thr).astype(np.uint8) * 255              # all ink (drawing + text)
        k = max(11, int(0.05*max(crop.shape[:2])) | 1)
        terr = cv2.dilate(ink, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
        n, lab, stats, _ = cv2.connectedComponentsWithStats(terr, 8)
        if n > 1:
            big = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))   # the drawing
            text = ((ink > 0) & (lab != big)).astype(np.uint8) * 255  # ink NOT in the drawing
            # Grow the mask a hair so the soft anti-aliased edges of the text get
            # painted too (otherwise a faint ghost halo is left behind).
            dk = max(3, int(0.008*max(crop.shape[:2])) | 1)
            text = cv2.dilate(text, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (dk, dk)))
            paper = crop[gray >= thr]
            fill = np.median(paper, axis=0).astype(np.uint8) if len(paper) else np.array([255,255,255], np.uint8)
            out[text > 0] = fill
    return Image.fromarray(out, "RGB")

def process(i):
    rgb = hires(i)
    boxes = detect(rgb)
    over = rgb.copy()
    out = []
    for j, d in enumerate(boxes):
        b = d.get("box");
        if not b or len(b) != 4: continue
        t = tighten(rgb, b)
        if not t: continue
        crop, ab = t
        cut = cutout(crop)
        fn = f"jan/cutouts/p{i:02d}_{j}.png"
        cut.save(fn)
        out.append((fn, d.get("label",""), ab))
        cv2.rectangle(over, (ab[0],ab[1]), (ab[2],ab[3]), (220,20,20), 6)
    Image.fromarray(over).resize((over.shape[1]//3, over.shape[0]//3)).save(f"jan/overlays/p{i:02d}.png")
    return out

if __name__ == "__main__":
    import sys
    pages = [int(x) for x in sys.argv[1:]] or [2,3,4,5,6,7]
    allout = []
    for i in pages:
        res = process(i)
        print(f"page {i}: {len(res)} drawing(s) -> " + ", ".join(f"{r[1]!r}" for r in res))
        allout += res
    print("TOTAL cutouts:", len(allout))
