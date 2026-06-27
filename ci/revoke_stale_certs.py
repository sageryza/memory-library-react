#!/usr/bin/env python3
"""Revoke stale App Store Connect certificates before a cloud build.

Each ephemeral CI runner signs with `-allowProvisioningUpdates`, which mints a
brand-new certificate every run (the private key only ever lived on that
runner, so the cert is disposable afterwards). Apple caps the account at 2
Development + 3 Distribution certificates, so after a couple of builds the
account fills up and archiving fails with:

    Choose a certificate to revoke. Your account has reached the maximum
    number of certificates.

This script keeps the single newest certificate in each category (development /
distribution) and revokes the rest, leaving headroom for this run to mint a
fresh one. Because the app is built Mac-less (only CI ever holds these keys),
revoking the older ones is safe.

Auth uses the same App Store Connect API key the build uses. JWT is ES256,
signed with `openssl` (no third-party Python crypto needed).
"""
import base64
import json
import os
import subprocess
import sys
import time
import urllib.request
import urllib.error

API = "https://api.appstoreconnect.apple.com/v1/certificates"


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def der_sig_to_raw(der: bytes) -> bytes:
    """Convert an OpenSSL DER ECDSA signature to fixed-width r||s (P-256 → 64 bytes)."""
    assert der[0] == 0x30, "bad DER sequence"
    idx = 2
    if der[1] & 0x80:  # long-form length (not expected for P-256, handle anyway)
        idx = 2 + (der[1] & 0x7F)
    assert der[idx] == 0x02, "bad DER int (r)"
    rlen = der[idx + 1]
    r = der[idx + 2: idx + 2 + rlen]
    j = idx + 2 + rlen
    assert der[j] == 0x02, "bad DER int (s)"
    slen = der[j + 1]
    s = der[j + 2: j + 2 + slen]
    r = r.lstrip(b"\x00").rjust(32, b"\x00")
    s = s.lstrip(b"\x00").rjust(32, b"\x00")
    return r + s


def make_jwt(key_id: str, issuer_id: str, key_path: str) -> str:
    header = {"alg": "ES256", "kid": key_id, "typ": "JWT"}
    now = int(time.time())
    payload = {"iss": issuer_id, "iat": now, "exp": now + 600, "aud": "appstoreconnect-v1"}
    signing_input = f"{b64url(json.dumps(header).encode())}.{b64url(json.dumps(payload).encode())}"
    der = subprocess.run(
        ["openssl", "dgst", "-sha256", "-sign", key_path],
        input=signing_input.encode(), capture_output=True, check=True,
    ).stdout
    return f"{signing_input}.{b64url(der_sig_to_raw(der))}"


def request(method: str, url: str, token: str):
    req = urllib.request.Request(url, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read()
            return resp.status, (json.loads(body) if body else None)
    except urllib.error.HTTPError as e:
        return e.code, (e.read().decode(errors="replace") or "")


def main() -> int:
    key_id = os.environ["ASC_KEY_ID"]
    issuer_id = os.environ["ASC_ISSUER_ID"]
    key_b64 = os.environ["ASC_KEY_P8"]

    key_path = "/tmp/asc_revoke_key.p8"
    with open(key_path, "wb") as f:
        f.write(base64.b64decode(key_b64))

    token = make_jwt(key_id, issuer_id, key_path)

    status, data = request("GET", f"{API}?limit=200", token)
    if status != 200 or not isinstance(data, dict):
        print(f"::warning::Could not list certificates ({status}): {data}")
        return 0  # never block the build on cleanup

    certs = data.get("data", [])
    print(f"Found {len(certs)} certificate(s).")

    groups: dict[str, list] = {"development": [], "distribution": [], "other": []}
    for c in certs:
        t = (c.get("attributes", {}).get("certificateType") or "").upper()
        cat = "development" if "DEVELOPMENT" in t else "distribution" if "DISTRIBUTION" in t else "other"
        groups[cat].append(c)

    revoked = 0
    for cat, items in groups.items():
        if cat == "other":
            continue
        # newest first by expirationDate (1-year validity → newest expires latest)
        items.sort(key=lambda c: c.get("attributes", {}).get("expirationDate") or "", reverse=True)
        for c in items[1:]:  # keep the single newest, revoke the rest
            cid = c["id"]
            attrs = c.get("attributes", {})
            name = attrs.get("name") or attrs.get("displayName") or cid
            st, _ = request("DELETE", f"{API}/{cid}", token)
            if st in (200, 204):
                revoked += 1
                print(f"Revoked {cat} cert: {name} ({attrs.get('certificateType')})")
            else:
                print(f"::warning::Failed to revoke {name}: HTTP {st}")

    print(f"Revoked {revoked} stale certificate(s); kept the newest of each type.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
