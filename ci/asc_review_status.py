#!/usr/bin/env python3
"""Print the App Store review state for an app — version states, the current
review submission, and recent builds — so we can see exactly where a
submission sits without opening App Store Connect.

Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 (base64), APP_BUNDLE_ID.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from setup_internal_testing import token, api  # reuse the JWT + API helpers


def main():
    tok = token()
    bundle = os.environ.get("APP_BUNDLE_ID", "com.sageryza.xi").strip()

    st, d = api("GET", f"/apps?filter[bundleId]={bundle}&limit=1", tok)
    if st != 200 or not d.get("data"):
        print(f"::error::app {bundle} not found ({st}): {d}"); return 1
    app = d["data"][0]
    app_id = app["id"]
    print(f"app: {app['attributes'].get('name')} ({bundle}) -> {app_id}")

    st, d = api("GET", f"/apps/{app_id}/appStoreVersions?limit=5"
                       "&fields[appStoreVersions]=versionString,appStoreState,appVersionState,createdDate", tok)
    if st == 200:
        for v in d.get("data", []):
            a = v["attributes"]
            print(f"version {a.get('versionString')}: state={a.get('appVersionState') or a.get('appStoreState')} created={a.get('createdDate')}")

    st, d = api("GET", f"/reviewSubmissions?filter[app]={app_id}&limit=5"
                       "&fields[reviewSubmissions]=state,platform,submittedDate", tok)
    if st == 200:
        for s in d.get("data", []):
            a = s["attributes"]
            print(f"review submission: state={a.get('state')} submitted={a.get('submittedDate')}")
    else:
        print(f"reviewSubmissions query: {st}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
