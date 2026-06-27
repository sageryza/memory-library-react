#!/usr/bin/env python3
"""Invite an external TestFlight tester via the App Store Connect API.

Adds a tester (by email) to a named external beta group for a given app,
creating the group if needed, makes the latest valid build available to that
group, and best-effort submits that build for Beta App Review so the tester can
install once Apple approves it.

Runs on a CI runner that already holds the App Store Connect API key as repo
secrets — no local Mac and nothing for the user to paste. JWT is ES256, signed
with `openssl` (stdlib only, no third-party crypto).

Env:
  ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 (base64)  — the API key
  TESTER_EMAIL                                     — required
  TESTER_FIRST, TESTER_LAST                        — optional display name
  APP_BUNDLE_ID   (default com.sageryza.xi)
  GROUP_NAME      (default "Friends")
  SUBMIT_BUILD    (default "true")  — also submit latest build for beta review
  CONTACT_FIRST, CONTACT_LAST, CONTACT_EMAIL, CONTACT_PHONE — beta review contact
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


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def der_sig_to_raw(der: bytes) -> bytes:
    assert der[0] == 0x30
    idx = 2 + ((der[1] & 0x7F) if der[1] & 0x80 else 0)
    assert der[idx] == 0x02
    rlen = der[idx + 1]
    r = der[idx + 2: idx + 2 + rlen]
    j = idx + 2 + rlen
    assert der[j] == 0x02
    slen = der[j + 1]
    s = der[j + 2: j + 2 + slen]
    return r.lstrip(b"\x00").rjust(32, b"\x00") + s.lstrip(b"\x00").rjust(32, b"\x00")


def make_token() -> str:
    key_id, issuer = os.environ["ASC_KEY_ID"], os.environ["ASC_ISSUER_ID"]
    path = "/tmp/asc_invite_key.p8"
    with open(path, "wb") as f:
        f.write(base64.b64decode(os.environ["ASC_KEY_P8"]))
    header = {"alg": "ES256", "kid": key_id, "typ": "JWT"}
    now = int(time.time())
    payload = {"iss": issuer, "iat": now, "exp": now + 600, "aud": "appstoreconnect-v1"}
    signing_input = f"{b64url(json.dumps(header).encode())}.{b64url(json.dumps(payload).encode())}"
    der = subprocess.run(["openssl", "dgst", "-sha256", "-sign", path],
                         input=signing_input.encode(), capture_output=True, check=True).stdout
    return f"{signing_input}.{b64url(der_sig_to_raw(der))}"


def api(method: str, path: str, token: str, body=None):
    url = path if path.startswith("http") else f"{BASE}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="replace")
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw


def fail(msg: str) -> int:
    print(f"::error::{msg}")
    return 1


def main() -> int:
    token = make_token()
    email = os.environ["TESTER_EMAIL"].strip()
    first = os.environ.get("TESTER_FIRST", "").strip() or "Tester"
    last = os.environ.get("TESTER_LAST", "").strip() or "."
    bundle = os.environ.get("APP_BUNDLE_ID", "com.sageryza.xi").strip()
    group_name = os.environ.get("GROUP_NAME", "Friends").strip()
    do_submit = os.environ.get("SUBMIT_BUILD", "true").lower() != "false"

    # 1. app id
    st, d = api("GET", f"/apps?filter[bundleId]={bundle}&limit=1", token)
    if st != 200 or not d.get("data"):
        return fail(f"App {bundle} not found ({st}): {d}")
    app_id = d["data"][0]["id"]
    print(f"App {bundle} → {app_id}")

    # 2. find or create the external beta group
    st, d = api("GET", f"/apps/{app_id}/betaGroups?limit=200", token)
    groups = d.get("data", []) if st == 200 else []
    group = next((g for g in groups
                  if g["attributes"].get("name") == group_name
                  and not g["attributes"].get("isInternalGroup")), None)
    if group:
        group_id = group["id"]
        print(f"Using existing external group '{group_name}' → {group_id}")
    else:
        st, d = api("POST", "/betaGroups", token, {
            "data": {"type": "betaGroups",
                     "attributes": {"name": group_name, "publicLinkEnabled": False},
                     "relationships": {"app": {"data": {"type": "apps", "id": app_id}}}}})
        if st not in (200, 201):
            return fail(f"Could not create group '{group_name}' ({st}): {d}")
        group_id = d["data"]["id"]
        print(f"Created external group '{group_name}' → {group_id}")

    # 3. create the tester (or attach an existing one to the group)
    st, d = api("POST", "/betaTesters", token, {
        "data": {"type": "betaTesters",
                 "attributes": {"email": email, "firstName": first, "lastName": last},
                 "relationships": {"betaGroups": {"data": [{"type": "betaGroups", "id": group_id}]}}}})
    if st in (200, 201):
        print(f"Invited {email} to '{group_name}'.")
    elif st == 409:
        # already a tester somewhere — just add to this group
        st2, d2 = api("GET", f"/betaTesters?filter[email]={email}&limit=1", token)
        tid = d2["data"][0]["id"] if st2 == 200 and d2.get("data") else None
        if not tid:
            return fail(f"Tester exists but could not be looked up: {d}")
        st3, d3 = api("POST", f"/betaGroups/{group_id}/relationships/betaTesters", token,
                      {"data": [{"type": "betaTesters", "id": tid}]})
        if st3 not in (200, 201, 204):
            return fail(f"Could not add existing tester to group ({st3}): {d3}")
        print(f"{email} was already a tester — added to '{group_name}'.")
    else:
        return fail(f"Could not invite {email} ({st}): {d}")

    if not do_submit:
        print("Skipping build submission (SUBMIT_BUILD=false).")
        return 0

    # 4. latest build, made available to the group + submitted for beta review
    st, d = api("GET", f"/builds?filter[app]={app_id}&sort=-uploadedDate&limit=1", token)
    if st != 200 or not d.get("data"):
        print("::warning::No build found to submit yet — re-run once a build has uploaded.")
        return 0
    build = d["data"][0]
    build_id = build["id"]
    state = build["attributes"].get("processingState")
    ver = build["attributes"].get("version")
    print(f"Latest build {ver} → {build_id} (processingState={state})")
    if state != "VALID":
        print(f"::warning::Build {ver} is still '{state}'. Re-run after it finishes processing to submit for review.")
        # still attach to group so it goes out the moment it's approved
    api("POST", f"/betaGroups/{group_id}/relationships/builds", token,
        {"data": [{"type": "builds", "id": build_id}]})

    # Beta App Review needs: whatsNew on the build, a beta app localization, and
    # contact details. Fill them best-effort; report anything Apple rejects.
    ensure_whats_new(token, build_id, ver)
    ensure_beta_localization(token, app_id)
    ensure_review_contact(token, app_id, email)

    if state == "VALID":
        st, d = api("POST", "/betaAppReviewSubmissions", token,
                    {"data": {"type": "betaAppReviewSubmissions",
                              "relationships": {"build": {"data": {"type": "builds", "id": build_id}}}}})
        if st in (200, 201):
            print(f"Submitted build {ver} for Beta App Review. Apple usually clears it within ~24h; "
                  f"{email} gets the invite once approved.")
        elif st == 409:
            print(f"Build {ver} is already submitted / in review.")
        else:
            print(f"::warning::Could not auto-submit for review ({st}): {d}\n"
                  f"::warning::Add Beta App Review info in App Store Connect → TestFlight, then it'll submit.")
    return 0


def ensure_whats_new(token, build_id, ver):
    st, d = api("GET", f"/builds/{build_id}/betaBuildLocalizations?limit=10", token)
    locs = d.get("data", []) if st == 200 else []
    text = "Versus mode — start or join a game by code and tell the stories of touching cards."
    if locs:
        for loc in locs:
            if not (loc["attributes"].get("whatsNew") or "").strip():
                api("PATCH", f"/betaBuildLocalizations/{loc['id']}", token,
                    {"data": {"type": "betaBuildLocalizations", "id": loc["id"],
                              "attributes": {"whatsNew": text}}})
    else:
        api("POST", "/betaBuildLocalizations", token,
            {"data": {"type": "betaBuildLocalizations",
                      "attributes": {"locale": "en-US", "whatsNew": text},
                      "relationships": {"build": {"data": {"type": "builds", "id": build_id}}}}})


def ensure_beta_localization(token, app_id):
    st, d = api("GET", f"/apps/{app_id}/betaAppLocalizations?limit=10", token)
    if st == 200 and d.get("data"):
        return
    api("POST", "/betaAppLocalizations", token,
        {"data": {"type": "betaAppLocalizations",
                  "attributes": {"locale": "en-US",
                                 "feedbackEmail": os.environ.get("CONTACT_EMAIL", "sageryza@gmail.com"),
                                 "description": "A small memory game."},
                  "relationships": {"app": {"data": {"type": "apps", "id": app_id}}}}})


def ensure_review_contact(token, app_id, fallback_email):
    contact = {
        "contactFirstName": os.environ.get("CONTACT_FIRST", "Sage"),
        "contactLastName": os.environ.get("CONTACT_LAST", "R"),
        "contactEmail": os.environ.get("CONTACT_EMAIL", "sageryza@gmail.com"),
        "contactPhone": os.environ.get("CONTACT_PHONE", ""),
    }
    st, d = api("GET", f"/apps/{app_id}/betaAppReviewDetail", token)
    if st == 200 and d.get("data"):
        api("PATCH", f"/betaAppReviewDetails/{d['data']['id']}", token,
            {"data": {"type": "betaAppReviewDetails", "id": d["data"]["id"], "attributes": contact}})


if __name__ == "__main__":
    sys.exit(main())
