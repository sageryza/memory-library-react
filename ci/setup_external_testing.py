#!/usr/bin/env python3
"""Set up external TestFlight testing (public link + Beta App Review) for an app.

Mirrors setup_internal_testing.py but for an EXTERNAL group: creates/finds the
group, attaches the latest VALID build, fills in the Beta App Review contact +
test info, enables the public TestFlight link, and submits the build for Beta
App Review. Prints the public link. Reuses the account-wide ASC API key.

Env:
  ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 (base64)
  APP_BUNDLE_ID                      app to set up
  GROUP_NAME            (default "Public Beta")
  CONTACT_FIRST/LAST/EMAIL/PHONE     Beta App Review contact (phone via secret)
  FEEDBACK_EMAIL        (default CONTACT_EMAIL)   shown to testers
  BETA_DESCRIPTION      (optional) app-level "what to test" blurb
  WHATS_NEW             (optional) per-build notes
  PRIVACY_URL           (optional)
  DEMO_USER, DEMO_PASS  (optional) reviewer demo account for login-gated apps
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
LOCALE = "en-US"


def b64url(d): return base64.urlsafe_b64encode(d).rstrip(b"=").decode()


def der_to_raw(der):
    assert der[0] == 0x30
    i = 2 + ((der[1] & 0x7F) if der[1] & 0x80 else 0)
    rl = der[i + 1]; r = der[i + 2:i + 2 + rl]
    j = i + 2 + rl; sl = der[j + 1]; s = der[j + 2:j + 2 + sl]
    return r.lstrip(b"\x00").rjust(32, b"\x00") + s.lstrip(b"\x00").rjust(32, b"\x00")


def token():
    p = "/tmp/asc_external.p8"
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
    bundle = os.environ.get("APP_BUNDLE_ID", "").strip()
    gname = os.environ.get("GROUP_NAME", "Public Beta").strip() or "Public Beta"
    first = os.environ.get("CONTACT_FIRST", "Sage").strip() or "Sage"
    last = os.environ.get("CONTACT_LAST", "Ryza").strip() or "Ryza"
    email = os.environ.get("CONTACT_EMAIL", "sageryza@gmail.com").strip()
    phone = os.environ.get("CONTACT_PHONE", "").strip()
    feedback = os.environ.get("FEEDBACK_EMAIL", "").strip() or email
    desc = os.environ.get("BETA_DESCRIPTION", "").strip()
    whats_new = os.environ.get("WHATS_NEW", "").strip() or "First external TestFlight build."
    privacy = os.environ.get("PRIVACY_URL", "").strip()
    demo_user = os.environ.get("DEMO_USER", "").strip()
    demo_pass = os.environ.get("DEMO_PASS", "").strip()

    if not bundle:
        print("::error::APP_BUNDLE_ID is required"); return 1
    if not phone:
        print("::error::CONTACT_PHONE is required for Beta App Review "
              "(set the ASC_CONTACT_PHONE secret)"); return 1

    st, d = api("GET", f"/apps?filter[bundleId]={bundle}&limit=1", tok)
    if st != 200 or not d.get("data"):
        print(f"::error::app {bundle} not found ({st}): {d}"); return 1
    app_id = d["data"][0]["id"]
    print(f"App {bundle} -> {app_id}")

    # latest VALID build (required to submit for review)
    st, d = api("GET", f"/builds?filter[app]={app_id}&sort=-uploadedDate&limit=1", tok)
    if st != 200 or not d.get("data"):
        print(f"::error::no build found for {bundle} yet"); return 1
    b = d["data"][0]
    build_id = b["id"]; build_state = b["attributes"].get("processingState"); build_ver = b["attributes"].get("version")
    print(f"Latest build {build_ver} processingState={build_state} id={build_id}")
    if build_state != "VALID":
        print(f"::warning::build {build_ver} not VALID yet ({build_state}); rerun once Apple finishes processing.")
        return 1

    # ---- Beta App Review contact + demo info (one per app) ----
    st, d = api("GET", f"/apps/{app_id}/betaAppReviewDetail", tok)
    attrs = {
        "contactFirstName": first, "contactLastName": last,
        "contactEmail": email, "contactPhone": phone,
        "demoAccountRequired": bool(demo_user),
        "demoAccountName": demo_user, "demoAccountPassword": demo_pass,
    }
    if st == 200 and d.get("data"):
        rid = d["data"]["id"]
        st2, d2 = api("PATCH", f"/betaAppReviewDetails/{rid}", tok,
                      {"data": {"type": "betaAppReviewDetails", "id": rid, "attributes": attrs}})
        print(f"Beta App Review detail updated: HTTP {st2}")
    else:
        print(f"::warning::could not read betaAppReviewDetail ({st}): {d}")

    # ---- app-level beta info (feedback email, description, privacy) ----
    loc_attrs = {"feedbackEmail": feedback}
    if desc:
        loc_attrs["description"] = desc
    if privacy:
        loc_attrs["privacyPolicyUrl"] = privacy
    st, d = api("GET", f"/apps/{app_id}/betaAppLocalizations?limit=50", tok)
    locs = d.get("data", []) if st == 200 else []
    loc = next((l for l in locs if l["attributes"].get("locale") == LOCALE), None) or (locs[0] if locs else None)
    if loc:
        st2, _ = api("PATCH", f"/betaAppLocalizations/{loc['id']}", tok,
                     {"data": {"type": "betaAppLocalizations", "id": loc["id"], "attributes": loc_attrs}})
        print(f"Beta app localization updated: HTTP {st2}")
    else:
        body = {"data": {"type": "betaAppLocalizations",
                         "attributes": {**loc_attrs, "locale": LOCALE},
                         "relationships": {"app": {"data": {"type": "apps", "id": app_id}}}}}
        st2, _ = api("POST", "/betaAppLocalizations", tok, body)
        print(f"Beta app localization created: HTTP {st2}")

    # ---- per-build "what to test" ----
    st, d = api("GET", f"/builds/{build_id}/betaBuildLocalizations?limit=50", tok)
    blocs = d.get("data", []) if st == 200 else []
    bloc = next((l for l in blocs if l["attributes"].get("locale") == LOCALE), None) or (blocs[0] if blocs else None)
    if bloc:
        api("PATCH", f"/betaBuildLocalizations/{bloc['id']}", tok,
            {"data": {"type": "betaBuildLocalizations", "id": bloc["id"],
                      "attributes": {"whatsNew": whats_new}}})
    else:
        api("POST", "/betaBuildLocalizations", tok,
            {"data": {"type": "betaBuildLocalizations",
                      "attributes": {"locale": LOCALE, "whatsNew": whats_new},
                      "relationships": {"build": {"data": {"type": "builds", "id": build_id}}}}})
    print("Per-build 'what to test' set.")

    # ---- find or create the external group ----
    st, d = api("GET", f"/apps/{app_id}/betaGroups?limit=200", tok)
    groups = d.get("data", []) if st == 200 else []
    ext = next((g for g in groups if not g["attributes"].get("isInternalGroup")
                and g["attributes"].get("name") == gname), None)
    ext = ext or next((g for g in groups if not g["attributes"].get("isInternalGroup")), None)
    if ext:
        gid = ext["id"]
        print(f"Using external group '{ext['attributes'].get('name')}' -> {gid}")
    else:
        st, d = api("POST", "/betaGroups", tok, {
            "data": {"type": "betaGroups",
                     "attributes": {"name": gname, "isInternalGroup": False},
                     "relationships": {"app": {"data": {"type": "apps", "id": app_id}}}}})
        if st not in (200, 201):
            print(f"::error::could not create external group ({st}): {d}"); return 1
        gid = d["data"]["id"]
        print(f"Created external group '{gname}' -> {gid}")

    # ---- attach build to the group ----
    st, _ = api("POST", f"/betaGroups/{gid}/relationships/builds", tok,
                {"data": [{"type": "builds", "id": build_id}]})
    print(f"Attach build {build_ver} to '{gname}': HTTP {st}")

    # ---- submit the build for Beta App Review ----
    st, d = api("POST", "/betaAppReviewSubmissions", tok, {
        "data": {"type": "betaAppReviewSubmissions",
                 "relationships": {"build": {"data": {"type": "builds", "id": build_id}}}}})
    if st in (200, 201):
        print(f"Submitted build {build_ver} for Beta App Review (HTTP {st}).")
    elif st == 409:
        print(f"Build already submitted / in review (HTTP 409).")
    else:
        print(f"::warning::beta review submission HTTP {st}: {d}")

    # ---- enable the public link (after a build is attached) ----
    st, d = api("PATCH", f"/betaGroups/{gid}", tok,
                {"data": {"type": "betaGroups", "id": gid,
                          "attributes": {"publicLinkEnabled": True}}})
    if st in (200, 201):
        link = d["data"]["attributes"].get("publicLink")
        print(f"PUBLIC LINK: {link or '(enabling — re-check in a moment)'}")
    else:
        print(f"::warning::could not enable public link ({st}): {d}")

    print(f"External testing set up for {bundle}. Once Beta App Review approves "
          f"the build, the public link goes live and anyone can install.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
