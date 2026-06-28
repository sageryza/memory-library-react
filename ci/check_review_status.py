#!/usr/bin/env python3
"""Report the TestFlight Beta App Review state of each app's latest build.

For each bundle id (comma-separated CHECK_BUNDLES, or a sensible default set),
prints the latest build's version, processing state, and external build state
(WAITING_FOR_BETA_REVIEW / IN_BETA_REVIEW / BETA_APPROVED / BETA_REJECTED /
READY_FOR_BETA_TESTING / …) so a watcher can act on approvals & rejections.

Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 (base64), CHECK_BUNDLES (optional)
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
DEFAULT_BUNDLES = "com.sageryza.sidequest,com.sageryza.miracles"


def b64url(d): return base64.urlsafe_b64encode(d).rstrip(b"=").decode()


def der_to_raw(der):
    assert der[0] == 0x30
    i = 2 + ((der[1] & 0x7F) if der[1] & 0x80 else 0)
    rl = der[i + 1]; r = der[i + 2:i + 2 + rl]
    j = i + 2 + rl; sl = der[j + 1]; s = der[j + 2:j + 2 + sl]
    return r.lstrip(b"\x00").rjust(32, b"\x00") + s.lstrip(b"\x00").rjust(32, b"\x00")


def token():
    p = "/tmp/asc_status.p8"
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
    bundles = [b.strip() for b in os.environ.get("CHECK_BUNDLES", DEFAULT_BUNDLES).split(",") if b.strip()]
    for bundle in bundles:
        st, d = api(f"/apps?filter[bundleId]={bundle}&limit=1", tok)
        if st != 200 or not d.get("data"):
            print(f"STATUS {bundle}: app-not-found ({st})"); continue
        app_id = d["data"][0]["id"]

        st, d = api(f"/builds?filter[app]={app_id}&sort=-uploadedDate&limit=5", tok)
        if st != 200 or not d.get("data"):
            print(f"STATUS {bundle}: no-build"); continue
        builds = d["data"]

        # Detail line per recent build: processing + internal + external state.
        latest_states = None
        for idx, b in enumerate(builds):
            bid = b["id"]; ver = b["attributes"].get("version")
            proc = b["attributes"].get("processingState")
            ext = inta = "UNKNOWN"
            st, dd = api(f"/builds/{bid}/buildBetaDetail", tok)
            if st == 200 and dd.get("data"):
                a = dd["data"]["attributes"]
                ext = a.get("externalBuildState", "UNKNOWN")
                inta = a.get("internalBuildState", "UNKNOWN")
            print(f"BUILD {bundle}: v{ver} processing={proc} internal={inta} external={ext}")
            if idx == 0:
                latest_states = (ver, proc, ext)

        # Keep the watcher-parsed STATUS line (latest build, external state).
        if latest_states:
            ver, proc, ext = latest_states
            print(f"STATUS {bundle}: build {ver} processing={proc} review={ext}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
