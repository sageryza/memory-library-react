#!/usr/bin/env python3
"""Set up internal TestFlight testing for an app via the App Store Connect API.

Finds (or creates) an internal beta group for the app and adds a team member as
an internal tester, so builds show up in their TestFlight with no Beta App
Review. Also reports the latest build's processing state. Internal testers must
be members of the App Store Connect team (the account holder qualifies).

Env:
  ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 (base64)
  APP_BUNDLE_ID   (default com.sageryza.imageforge)
  TESTER_EMAIL    (default sageryza@gmail.com) — must be a team member
  TESTER_FIRST, TESTER_LAST
  GROUP_NAME      (default "Internal")
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
    p = "/tmp/asc_internal.p8"
    open(p, "wb").write(base64.b64decode(os.environ["ASC_KEY_P8"]))
    h = {"alg": "ES256", "kid": os.environ["ASC_KEY_ID"], "typ": "JWT"}
    now = int(time.time())
    pl = {"iss": os.environ["ASC_ISSUER_ID"], "iat": now, "exp": now + 600, "aud": "appstoreconnect-v1"}
    si = f"{b64url(json.dumps(h).encode())}.{b64url(json.dumps(pl).encode())}"
    der = subprocess.run(["openssl", "dgst", "-sha256", "-sign", p],
                         input=si.encode(), capture_output=True, check=True).stdout
    return f"{si}.{b64url(der_to_raw(der))}"


def api(method, path, tok, body=None):
    url = path if path.startswith("http") else BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {tok}")
    if data is not None:
        req.add_header("Content-Type", "application/json")
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
    bundle = os.environ.get("APP_BUNDLE_ID", "com.sageryza.imageforge").strip()
    email = os.environ.get("TESTER_EMAIL", "sageryza@gmail.com").strip()
    first = os.environ.get("TESTER_FIRST", "Sage").strip() or "Sage"
    last = os.environ.get("TESTER_LAST", "Ryza").strip() or "Ryza"
    gname = os.environ.get("GROUP_NAME", "Internal").strip()

    st, d = api("GET", f"/apps?filter[bundleId]={bundle}&limit=1", tok)
    if st != 200 or not d.get("data"):
        print(f"::error::app {bundle} not found ({st}): {d}"); return 1
    app_id = d["data"][0]["id"]
    print(f"App {bundle} -> {app_id}")

    # latest build + processing state. With WAIT_VALID set (used right after a
    # CI upload), poll until the just-uploaded build finishes processing so we
    # attach IT, not the previous build.
    build_id = build_state = build_ver = None
    wait = os.environ.get("WAIT_VALID", "").lower() in ("1", "true", "yes")
    deadline = time.time() + (25 * 60 if wait else 0)
    while True:
        st, d = api("GET", f"/builds?filter[app]={app_id}&sort=-uploadedDate&limit=1", tok)
        if st == 200 and d.get("data"):
            b = d["data"][0]
            build_id = b["id"]; build_state = b["attributes"].get("processingState")
            build_ver = b["attributes"].get("version")
            print(f"Latest build {build_ver} processingState={build_state} id={build_id}")
        else:
            print("::warning::no build found yet for this app.")
        if not wait or build_state == "VALID" or time.time() >= deadline:
            break
        print("  …still processing; re-checking in 30s")
        time.sleep(30)
        tok = token()  # JWT expires in 10 min — refresh while waiting

    # find or create an internal group
    st, d = api("GET", f"/apps/{app_id}/betaGroups?limit=200", tok)
    groups = d.get("data", []) if st == 200 else []
    internal = next((g for g in groups if g["attributes"].get("isInternalGroup")), None)
    if internal:
        gid = internal["id"]
        print(f"Using existing internal group '{internal['attributes'].get('name')}' -> {gid}")
    else:
        st, d = api("POST", "/betaGroups", tok, {
            "data": {"type": "betaGroups",
                     "attributes": {"name": gname, "isInternalGroup": True},
                     "relationships": {"app": {"data": {"type": "apps", "id": app_id}}}}})
        if st not in (200, 201):
            print(f"::error::could not create internal group ({st}): {d}"); return 1
        gid = d["data"]["id"]
        print(f"Created internal group '{gname}' -> {gid}")

    # add the team member as an internal tester
    tester_id = None
    st, d = api("POST", "/betaTesters", tok, {
        "data": {"type": "betaTesters",
                 "attributes": {"email": email, "firstName": first, "lastName": last},
                 "relationships": {"betaGroups": {"data": [{"type": "betaGroups", "id": gid}]}}}})
    if st in (200, 201):
        tester_id = d["data"]["id"]
        print(f"Added {email} as an internal tester.")
    elif st == 409:
        st2, d2 = api("GET", f"/betaTesters?filter[email]={email}&limit=1", tok)
        tester_id = d2["data"][0]["id"] if st2 == 200 and d2.get("data") else None
        if tester_id:
            api("POST", f"/betaGroups/{gid}/relationships/betaTesters", tok,
                {"data": [{"type": "betaTesters", "id": tester_id}]})
            print(f"{email} already a tester — ensured in the internal group.")
        else:
            print(f"::warning::{email} exists but lookup failed: {d}")
    else:
        print(f"::error::could not add tester ({st}): {d}"); return 1

    # attach the latest valid build to the internal group (testers need it linked)
    if build_id and build_state == "VALID":
        st, d = api("POST", f"/betaGroups/{gid}/relationships/builds", tok,
                    {"data": [{"type": "builds", "id": build_id}]})
        print(f"Attach build {build_ver} to '{gname}': HTTP {st}"
              + ("" if st in (200, 201, 204) else f"  resp={d}"))

    # (re)send the TestFlight invitation email so the tester actually gets it
    if tester_id:
        st, d = api("POST", "/betaTesterInvitations", tok, {
            "data": {"type": "betaTesterInvitations",
                     "relationships": {
                         "app": {"data": {"type": "apps", "id": app_id}},
                         "betaTester": {"data": {"type": "betaTesters", "id": tester_id}}}}})
        print(f"Send TestFlight invite email to {email}: HTTP {st}"
              + ("" if st in (200, 201) else f"  resp={d}"))

    # diagnostics — what does the group actually contain now?
    st, d = api("GET", f"/betaGroups/{gid}/builds?limit=10", tok)
    print("group build count:", len(d.get("data", [])) if st == 200 else (st, d))
    st, d = api("GET", f"/betaGroups/{gid}/betaTesters?limit=25", tok)
    if st == 200:
        for t in d.get("data", []):
            a = t.get("attributes", {})
            print(f"  tester: {a.get('email')} state={a.get('state')} invite={a.get('inviteType')}")

    print("Internal testing is set up. The tester should see the build in TestFlight "
          "(once it finishes processing) and gets an email.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
