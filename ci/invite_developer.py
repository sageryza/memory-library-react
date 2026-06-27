#!/usr/bin/env python3
"""Invite a teammate to the Apple Developer team via the App Store Connect API.

A team member with the Developer role can work with builds/certs/TestFlight and
is eligible to be an internal tester (instant TestFlight access, no Beta App
Review wait). This sends the invitation email; the person must accept it
themselves to join. Runs on a CI runner holding the API key as repo secrets.

Env:
  ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 (base64)
  INVITE_EMAIL              — required
  INVITE_FIRST, INVITE_LAST — display name (Apple requires both)
  INVITE_ROLE              — default DEVELOPER (e.g. DEVELOPER, APP_MANAGER, ADMIN)
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
    path = "/tmp/asc_dev_key.p8"
    with open(path, "wb") as f:
        f.write(base64.b64decode(os.environ["ASC_KEY_P8"]))
    header = {"alg": "ES256", "kid": os.environ["ASC_KEY_ID"], "typ": "JWT"}
    now = int(time.time())
    payload = {"iss": os.environ["ASC_ISSUER_ID"], "iat": now, "exp": now + 600, "aud": "appstoreconnect-v1"}
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


def main() -> int:
    token = make_token()
    email = os.environ["INVITE_EMAIL"].strip()
    first = os.environ.get("INVITE_FIRST", "").strip() or email.split("@")[0]
    last = os.environ.get("INVITE_LAST", "").strip() or "."
    role = os.environ.get("INVITE_ROLE", "DEVELOPER").strip().upper()

    # Already a team member or already invited?
    st, d = api("GET", f"/users?filter[username]={email}&limit=1", token)
    if st == 200 and d.get("data"):
        print(f"{email} is already a team member — nothing to do. "
              f"Add them to TestFlight → Internal Testing to give them build access.")
        return 0
    st, d = api("GET", f"/userInvitations?filter[email]={email}&limit=1", token)
    if st == 200 and d.get("data"):
        print(f"{email} already has a pending invitation — waiting on them to accept the email.")
        return 0

    st, d = api("POST", "/userInvitations", token, {
        "data": {"type": "userInvitations",
                 "attributes": {"email": email, "firstName": first, "lastName": last,
                                "roles": [role], "allAppsVisible": True,
                                "provisioningAllowed": True}}})
    if st in (200, 201):
        print(f"Invited {email} as {role}. Apple emailed them an invite — once they accept, "
              f"add them to TestFlight → Internal Testing for instant build access.")
        return 0
    print(f"::error::Could not invite {email} ({st}): {json.dumps(d) if isinstance(d, dict) else d}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
