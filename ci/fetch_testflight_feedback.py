#!/usr/bin/env python3
"""Fetch TestFlight beta feedback (screenshots + comments) from App Store Connect.

Prints the most recent tester feedback for an app — the written comment, the
build/device/OS it came from, and the screenshot download URLs — so the feedback
testers submit inside TestFlight can be pulled into a session and acted on,
instead of being copy-pasted into chat.

Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 (base64), FEEDBACK_BUNDLE
     (default com.sageryza.xi), FEEDBACK_LIMIT (default 20).
"""
import base64
import json
import os
import subprocess
import sys
import time
import urllib.request
import urllib.error

BASE = "https://api.appstoreconnect.apple.com/v1"


def b64url(d): return base64.urlsafe_b64encode(d).rstrip(b"=").decode()


def der_to_raw(der):
    assert der[0] == 0x30
    i = 2 + ((der[1] & 0x7F) if der[1] & 0x80 else 0)
    rl = der[i + 1]; r = der[i + 2:i + 2 + rl]
    j = i + 2 + rl; sl = der[j + 1]; s = der[j + 2:j + 2 + sl]
    return r.lstrip(b"\x00").rjust(32, b"\x00") + s.lstrip(b"\x00").rjust(32, b"\x00")


def token():
    p = "/tmp/asc_feedback.p8"
    open(p, "wb").write(base64.b64decode(os.environ["ASC_KEY_P8"]))
    h = {"alg": "ES256", "kid": os.environ["ASC_KEY_ID"], "typ": "JWT"}
    now = int(time.time())
    pl = {"iss": os.environ["ASC_ISSUER_ID"], "iat": now, "exp": now + 600, "aud": "appstoreconnect-v1"}
    si = f"{b64url(json.dumps(h).encode())}.{b64url(json.dumps(pl).encode())}"
    der = subprocess.run(["openssl", "dgst", "-sha256", "-sign", p],
                         input=si.encode(), capture_output=True, check=True).stdout
    return f"{si}.{b64url(der_to_raw(der))}"


def api(path, tok):
    req = urllib.request.Request(BASE + path if not path.startswith("http") else path, method="GET")
    req.add_header("Authorization", f"Bearer {tok}")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="replace")
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw


def main():
    tok = token()
    bundle = os.environ.get("FEEDBACK_BUNDLE", "com.sageryza.xi").strip()
    limit = os.environ.get("FEEDBACK_LIMIT", "20").strip() or "20"

    st, d = api(f"/apps?filter[bundleId]={bundle}&limit=1", tok)
    if st != 200 or not d.get("data"):
        print(f"::error::app {bundle} not found ({st}): {d}"); return 1
    app_id = d["data"][0]["id"]
    print(f"App {bundle} -> {app_id}")

    # Build id -> version map (for labelling each feedback's build).
    builds = {}
    st, d = api(f"/builds?filter[app]={app_id}&sort=-uploadedDate&limit=50", tok)
    if st == 200:
        for b in d.get("data", []):
            builds[b["id"]] = b["attributes"].get("version")

    path = (f"/betaFeedbackScreenshotSubmissions?filter[app]={app_id}"
            f"&sort=-createdDate&limit={limit}")
    st, d = api(path, tok)
    if st != 200:
        print(f"::error::could not read beta feedback ({st}): {d}"); return 1

    items = d.get("data", [])
    print(f"FEEDBACK_COUNT {len(items)}")
    if not items:
        print("No TestFlight feedback submitted yet.")
        return 0

    for it in items:
        a = it.get("attributes", {})
        bid = (it.get("relationships", {}).get("build", {}).get("data") or {}).get("id")
        ver = builds.get(bid, "?")
        created = a.get("createdDate", "?")
        device = a.get("deviceModel", "?")
        osv = a.get("osVersion", "?")
        comment = (a.get("comment") or "").strip()
        print("=" * 60)
        print(f"FEEDBACK {created} | build {ver} | {device} | iOS {osv}")
        if comment:
            print(f"COMMENT: {comment}")
        for shot in (a.get("screenshots") or []):
            url = shot.get("url")
            if url:
                print(f"SHOT: {url}")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
