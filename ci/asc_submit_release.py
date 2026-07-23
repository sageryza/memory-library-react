#!/usr/bin/env python3
"""Submit an app version to App Store review, end to end:

  1. find (or create) the appStoreVersion for VERSION_STRING
  2. attach the requested build (by build number) once it's done processing
  3. set the "What's New" release notes on every localization
  4. create a review submission for the version and submit it

Safe to re-run: every step checks current state first, so a failed run (e.g.
build still processing) can simply be retried.

Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 (base64), APP_BUNDLE_ID,
     VERSION_STRING (e.g. "1.1"), BUILD_NUMBER (e.g. "91"), WHATS_NEW.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from setup_internal_testing import token, api  # reuse the JWT + API helpers


def die(msg):
    print(f"::error::{msg}")
    sys.exit(1)


def main():
    tok = token()
    bundle = os.environ.get("APP_BUNDLE_ID", "com.sageryza.xi").strip()
    version = os.environ["VERSION_STRING"].strip()
    build_no = os.environ["BUILD_NUMBER"].strip()
    whats_new = os.environ.get("WHATS_NEW", "").strip()

    st, d = api("GET", f"/apps?filter[bundleId]={bundle}&limit=1", tok)
    if st != 200 or not d.get("data"):
        die(f"app {bundle} not found ({st}): {d}")
    app_id = d["data"][0]["id"]
    print(f"app {bundle} -> {app_id}")

    # RESUBMIT=true: pull an in-queue submission back (loses the queue spot)
    # so a newer build can be attached and submitted in its place.
    if os.environ.get("RESUBMIT", "").lower() == "true":
        st, d = api("GET", f"/reviewSubmissions?filter[app]={app_id}&filter[state]="
                           "WAITING_FOR_REVIEW,IN_REVIEW&limit=5", tok)
        for sub in (d.get("data") or []) if st == 200 else []:
            st2, _ = api("PATCH", f"/reviewSubmissions/{sub['id']}", tok, {
                "data": {"type": "reviewSubmissions", "id": sub["id"],
                         "attributes": {"canceled": True}}})
            print(f"canceled in-queue submission {sub['id']} "
                  f"(was {sub['attributes'].get('state')}): {st2}")

    # 1. The appStoreVersion for this version string (create if missing).
    st, d = api("GET", f"/apps/{app_id}/appStoreVersions?limit=10"
                       "&fields[appStoreVersions]=versionString,appVersionState,platform", tok)
    ver = next((v for v in d.get("data", []) if v["attributes"].get("versionString") == version), None) \
        if st == 200 else None
    if ver is None:
        st, d = api("POST", "/appStoreVersions", tok, {
            "data": {"type": "appStoreVersions",
                     "attributes": {"platform": "IOS", "versionString": version,
                                    "releaseType": "AFTER_APPROVAL"},
                     "relationships": {"app": {"data": {"type": "apps", "id": app_id}}}}})
        if st not in (200, 201):
            die(f"create appStoreVersion {version}: {st} {d}")
        ver = d["data"]
        print(f"created version {version} -> {ver['id']}")
    else:
        print(f"version {version} exists -> {ver['id']} "
              f"(state={ver['attributes'].get('appVersionState')})")
    ver_id = ver["id"]

    # 2. The build, which must be done processing before it can be attached.
    st, d = api("GET", f"/builds?filter[app]={app_id}&filter[version]={build_no}"
                       f"&filter[preReleaseVersion.version]={version}"
                       "&fields[builds]=version,processingState&limit=5", tok)
    if st != 200 or not d.get("data"):
        die(f"build {build_no} of {version} not found yet ({st}) — "
            f"is the upload finished? Re-run once it appears.")
    build = d["data"][0]
    proc = build["attributes"].get("processingState")
    if proc != "VALID":
        die(f"build {build_no} still processing (state={proc}) — re-run in a few minutes.")
    st, _ = api("PATCH", f"/appStoreVersions/{ver_id}/relationships/build", tok,
                {"data": {"type": "builds", "id": build["id"]}})
    if st not in (200, 204):
        die(f"attach build: {st}")
    print(f"attached build {build_no} ({build['id']})")

    # 3. Release notes on every localization (required for non-first versions).
    if whats_new:
        st, d = api("GET", f"/appStoreVersions/{ver_id}/appStoreVersionLocalizations"
                           "?fields[appStoreVersionLocalizations]=locale,whatsNew&limit=20", tok)
        if st != 200:
            die(f"list localizations: {st} {d}")
        for loc in d.get("data", []):
            st, _ = api("PATCH", f"/appStoreVersionLocalizations/{loc['id']}", tok, {
                "data": {"type": "appStoreVersionLocalizations", "id": loc["id"],
                         "attributes": {"whatsNew": whats_new}}})
            print(f"whatsNew [{loc['attributes'].get('locale')}]: {st}")

    # 4. Review submission: reuse an open one for this platform, else create.
    st, d = api("GET", f"/reviewSubmissions?filter[app]={app_id}&filter[state]="
                       "READY_FOR_REVIEW,WAITING_FOR_REVIEW,IN_REVIEW,UNRESOLVED_ISSUES&limit=5", tok)
    sub = (d.get("data") or [None])[0] if st == 200 else None
    if sub is None:
        st, d = api("POST", "/reviewSubmissions", tok, {
            "data": {"type": "reviewSubmissions", "attributes": {"platform": "IOS"},
                     "relationships": {"app": {"data": {"type": "apps", "id": app_id}}}}})
        if st not in (200, 201):
            die(f"create reviewSubmission: {st} {d}")
        sub = d["data"]
        print(f"created review submission -> {sub['id']}")
    else:
        print(f"open review submission -> {sub['id']} (state={sub['attributes'].get('state')})")
    sub_id = sub["id"]

    st, d = api("GET", f"/reviewSubmissions/{sub_id}/items?limit=10", tok)
    has_item = st == 200 and any(True for _ in d.get("data", []))
    if not has_item:
        st, d = api("POST", "/reviewSubmissionItems", tok, {
            "data": {"type": "reviewSubmissionItems",
                     "relationships": {
                         "reviewSubmission": {"data": {"type": "reviewSubmissions", "id": sub_id}},
                         "appStoreVersion": {"data": {"type": "appStoreVersions", "id": ver_id}}}}})
        if st not in (200, 201):
            die(f"add version to submission: {st} {d}")
        print("version added to submission")

    if sub["attributes"].get("state") == "READY_FOR_REVIEW":
        st, d = api("PATCH", f"/reviewSubmissions/{sub_id}", tok, {
            "data": {"type": "reviewSubmissions", "id": sub_id,
                     "attributes": {"submitted": True}}})
        if st != 200:
            die(f"submit for review: {st} {d}")
        print("SUBMITTED for App Store review 🎉")
    else:
        print(f"submission already past READY_FOR_REVIEW "
              f"(state={sub['attributes'].get('state')}) — nothing to do")
    return 0


if __name__ == "__main__":
    sys.exit(main())
