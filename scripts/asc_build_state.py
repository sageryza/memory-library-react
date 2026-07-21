#!/usr/bin/env python3
"""One-shot: report the processing/beta state of the Secretly a Witch builds."""
import os, time, json, base64, urllib.request
import jwt  # PyJWT

KEY_ID = os.environ["ASC_KEY_ID"]
ISSUER = os.environ["ASC_ISSUER_ID"]
P8 = base64.b64decode(os.environ["ASC_KEY_P8"]).decode()
BUNDLE = "com.sageryza.secretlyawitch"

def token():
    now = int(time.time())
    return jwt.encode(
        {"iss": ISSUER, "iat": now, "exp": now + 600, "aud": "appstoreconnect-v1"},
        P8, algorithm="ES256", headers={"kid": KEY_ID, "typ": "JWT"},
    )

def get(path):
    req = urllib.request.Request("https://api.appstoreconnect.apple.com" + path)
    req.add_header("Authorization", "Bearer " + token())
    with urllib.request.urlopen(req) as r:
        return json.load(r)

apps = get(f"/v1/apps?filter[bundleId]={BUNDLE}")
if not apps["data"]:
    print("NO APP RECORD found for", BUNDLE); raise SystemExit(0)
app = apps["data"][0]
app_id = app["id"]
print("APP:", app["attributes"].get("name"), "| id", app_id)

builds = get(f"/v1/builds?filter[app]={app_id}&limit=10&sort=-uploadedDate&include=buildBetaDetail")
inc = {(i["type"], i["id"]): i for i in builds.get("included", [])}
if not builds["data"]:
    print("NO BUILDS uploaded to this app yet."); raise SystemExit(0)
for b in builds["data"]:
    a = b["attributes"]
    detail_state = ""
    rel = b.get("relationships", {}).get("buildBetaDetail", {}).get("data")
    if rel:
        d = inc.get((rel["type"], rel["id"]))
        if d:
            detail_state = d["attributes"].get("internalBuildState")
    print(f"  build {a.get('version')}  processingState={a.get('processingState')}  "
          f"betaState={detail_state}  expired={a.get('expired')}  "
          f"uploaded={a.get('uploadedDate')}  compliance={a.get('usesNonExemptEncryption')}")

# ── Beta groups + testers for the app ──
print("---- beta groups ----")
groups = get(f"/v1/apps/{app_id}/betaGroups")
if not groups["data"]:
    print("NO beta groups exist for this app (no internal testing group yet).")
for g in groups["data"]:
    ga = g["attributes"]
    gid = g["id"]
    print(f"  group '{ga.get('name')}'  internal={ga.get('isInternalGroup')}  "
          f"autoDistribute={ga.get('hasAccessToAllBuilds')}")
    try:
        testers = get(f"/v1/betaGroups/{gid}/betaTesters")
        for t in testers["data"]:
            ta = t["attributes"]
            print(f"      tester: {ta.get('firstName')} {ta.get('lastName')} <{ta.get('email')}>  state={ta.get('state')}")
        if not testers["data"]:
            print("      (no testers in this group)")
    except Exception as e:
        print("      tester query failed:", e)
