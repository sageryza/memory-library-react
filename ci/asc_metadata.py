#!/usr/bin/env python3
"""Read or write an app's App Store metadata via the App Store Connect API.

The sibling asc_submit_release.py only ever writes "What's New" — everything
else on the product page (description, keywords, subtitle, promo text, the
support/marketing URLs, and the App Review contact / demo account / notes) had
to be typed into App Store Connect by hand. This script closes that gap so a
chat can edit the listing the same way it ships a build.

Two modes:

  DRY_RUN=true   print every current value and change nothing. Run this first —
                 it names the app, the version and the app-info record that a
                 write would land on, so nobody edits the wrong app.
  DRY_RUN=false  patch only the fields that were actually supplied. An empty
                 env var means "leave it alone"; to CLEAR a field pass the
                 literal string "" through FIELDS_JSON (e.g. {"subtitle": ""}).

Fields live on three different ASC resources and this routes them for you:

  appStoreVersionLocalizations  description, keywords, whatsNew,
                                promotionalText, supportUrl, marketingUrl
  appInfoLocalizations          name, subtitle, privacyPolicyUrl,
                                privacyPolicyText
  appStoreReviewDetails         contactFirstName, contactLastName,
                                contactPhone, contactEmail, demoAccountName,
                                demoAccountPassword, demoAccountRequired, notes

The version-level and app-info-level fields are written to EVERY localization
the app has (these apps are en-US only; if that ever changes, pass LOCALE).

Only a version in an editable state can be changed. After a rejection the
version goes to REJECTED / METADATA_REJECTED / DEVELOPER_REJECTED, all of which
are editable — so this is exactly the tool for reworking a listing that failed
review, then re-running asc_submit_release.py to send it back.

Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 (base64), APP_BUNDLE_ID,
     DRY_RUN, VERSION_STRING (optional — blank picks the editable version),
     LOCALE (optional — blank means every localization),
     FIELDS_JSON (optional — a JSON object of any field names above),
     plus DESCRIPTION, KEYWORDS, SUBTITLE, PROMOTIONAL_TEXT, WHATS_NEW,
     REVIEW_NOTES as convenience env vars for the six most-edited fields.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from setup_internal_testing import token, api  # reuse the JWT + API helpers

# field -> (resource, max length or None). Apple enforces these too, but it
# answers with a generic 409, so check here and say which field is too long.
VERSION_FIELDS = {
    "description": 4000,
    "keywords": 100,
    "whatsNew": 4000,
    "promotionalText": 170,
    "supportUrl": 255,
    "marketingUrl": 255,
}
APP_INFO_FIELDS = {
    "name": 30,
    "subtitle": 30,
    "privacyPolicyUrl": 255,
    "privacyPolicyText": None,
}
REVIEW_FIELDS = {
    "contactFirstName": None,
    "contactLastName": None,
    "contactPhone": None,
    "contactEmail": None,
    "demoAccountName": None,
    "demoAccountPassword": None,
    "demoAccountRequired": None,   # boolean
    "notes": 4000,
}
BOOL_FIELDS = {"demoAccountRequired"}

# The states in which Apple lets metadata be edited. A rejection lands in one
# of the three *REJECTED ones, which is why a rework needs no new version.
EDITABLE = {
    "PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED",
    "METADATA_REJECTED", "INVALID_BINARY", "WAITING_FOR_REVIEW",
    "REPLACED_WITH_NEW_INFO", "DEVELOPER_REMOVED_FROM_SALE",
}

# The convenience env vars, mapped onto their real field names.
ENV_FIELDS = {
    "DESCRIPTION": "description",
    "KEYWORDS": "keywords",
    "SUBTITLE": "subtitle",
    "PROMOTIONAL_TEXT": "promotionalText",
    "WHATS_NEW": "whatsNew",
    "REVIEW_NOTES": "notes",
}


def die(msg):
    print(f"::error::{msg}")
    sys.exit(1)


def collect_fields():
    """Gather the requested edits. FIELDS_JSON wins over the named env vars,
    so a caller can clear a field ("") that an env var can't express."""
    fields = {}
    for env_name, field in ENV_FIELDS.items():
        val = os.environ.get(env_name, "")
        if val.strip():
            fields[field] = val
    raw = os.environ.get("FIELDS_JSON", "").strip()
    if raw:
        try:
            extra = json.loads(raw)
        except json.JSONDecodeError as e:
            die(f"FIELDS_JSON is not valid JSON: {e}")
        if not isinstance(extra, dict):
            die("FIELDS_JSON must be a JSON object, e.g. {\"subtitle\": \"…\"}")
        fields.update(extra)

    known = {**VERSION_FIELDS, **APP_INFO_FIELDS, **REVIEW_FIELDS}
    for name, val in fields.items():
        if name not in known:
            die(f"unknown field '{name}' — known fields: {', '.join(sorted(known))}")
        if name in BOOL_FIELDS:
            continue
        if not isinstance(val, str):
            die(f"field '{name}' must be a string (got {type(val).__name__})")
        cap = known[name]
        if cap and len(val) > cap:
            die(f"field '{name}' is {len(val)} chars, Apple's limit is {cap}")
    return fields


def patch_localizations(kind, locs, fields, locale, dry):
    """PATCH the given fields onto every (or one) localization of a resource."""
    done = 0
    for loc in locs:
        loc_locale = loc["attributes"].get("locale")
        if locale and loc_locale != locale:
            continue
        body = {k: v for k, v in fields.items()}
        if dry:
            for k in body:
                cur = loc["attributes"].get(k)
                print(f"  would set {k} [{loc_locale}] "
                      f"({len(cur or '')} -> {len(body[k] or '')} chars)")
            done += 1
            continue
        st, d = api("PATCH", f"/{kind}/{loc['id']}", tok, {
            "data": {"type": kind, "id": loc["id"], "attributes": body}})
        if st not in (200, 201):
            die(f"patch {kind} [{loc_locale}]: {st} {d}")
        print(f"  wrote {', '.join(sorted(body))} [{loc_locale}]")
        done += 1
    if not done:
        die(f"no {kind} matched locale '{locale}'")


def show(attrs, names, label):
    print(f"\n--- {label} ---")
    for n in sorted(names):
        val = attrs.get(n)
        if val is None:
            print(f"  {n}: (unset)")
        elif isinstance(val, str) and len(val) > 300:
            print(f"  {n}: ({len(val)} chars) {val[:300]}…")
        else:
            print(f"  {n}: {val}")


def main():
    global tok
    tok = token()
    bundle = os.environ["APP_BUNDLE_ID"].strip()
    version = os.environ.get("VERSION_STRING", "").strip()
    locale = os.environ.get("LOCALE", "").strip()
    dry = os.environ.get("DRY_RUN", "true").lower() != "false"
    fields = collect_fields()

    if not dry and not fields:
        die("nothing to write — supply at least one field, or set DRY_RUN=true "
            "to read the current metadata")

    st, d = api("GET", f"/apps?filter[bundleId]={bundle}&limit=1", tok)
    if st != 200 or not d.get("data"):
        die(f"app {bundle} not found ({st}): {d}")
    app = d["data"][0]
    app_id = app["id"]
    print(f"app {bundle} -> {app_id} ({app['attributes'].get('name')})")

    ver_fields = {k: v for k, v in fields.items() if k in VERSION_FIELDS}
    info_fields = {k: v for k, v in fields.items() if k in APP_INFO_FIELDS}
    review_fields = {k: v for k, v in fields.items() if k in REVIEW_FIELDS}

    # ---- the appStoreVersion (description, keywords, promo text, what's new)
    ver = None
    if ver_fields or review_fields or dry:
        st, d = api("GET", f"/apps/{app_id}/appStoreVersions?limit=10"
                           "&fields[appStoreVersions]=versionString,appVersionState,platform", tok)
        if st != 200:
            die(f"list versions: {st} {d}")
        versions = d.get("data", [])
        if version:
            ver = next((v for v in versions
                        if v["attributes"].get("versionString") == version), None)
            if ver is None:
                have = ", ".join(v["attributes"].get("versionString") for v in versions)
                die(f"version {version} not found — the app has: {have}")
        else:
            ver = next((v for v in versions
                        if v["attributes"].get("appVersionState") in EDITABLE), None)
            if ver is None:
                die("no editable version — every version is live or in review. "
                    "Create the next version first (asc_submit_release.py does "
                    "that), or pass VERSION_STRING explicitly.")
        state = ver["attributes"].get("appVersionState")
        print(f"version {ver['attributes'].get('versionString')} -> {ver['id']} (state={state})")
        if state not in EDITABLE and not dry:
            die(f"version is {state}, which Apple does not allow metadata edits on")

    if ver is not None and (ver_fields or dry):
        st, d = api("GET", f"/appStoreVersions/{ver['id']}/appStoreVersionLocalizations"
                           "?limit=20", tok)
        if st != 200:
            die(f"list version localizations: {st} {d}")
        locs = d.get("data", [])
        if dry:
            for loc in locs:
                show(loc["attributes"], VERSION_FIELDS,
                     f"version metadata [{loc['attributes'].get('locale')}]")
        if ver_fields:
            print("\nversion metadata:")
            patch_localizations("appStoreVersionLocalizations", locs,
                                ver_fields, locale, dry)

    # ---- the appInfo (name, subtitle, privacy policy) — its own record, and
    # only the non-live one is editable, so pick that one deliberately.
    if info_fields or dry:
        st, d = api("GET", f"/apps/{app_id}/appInfos?limit=10", tok)
        if st != 200:
            die(f"list app infos: {st} {d}")
        infos = d.get("data", [])

        def info_state(i):
            a = i["attributes"]
            return a.get("state") or a.get("appStoreState")

        info = next((i for i in infos if info_state(i) in EDITABLE), None) \
            or (infos[0] if infos else None)
        if info is None:
            die("app has no appInfo record")
        print(f"\napp info -> {info['id']} (state={info_state(info)})")
        st, d = api("GET", f"/appInfos/{info['id']}/appInfoLocalizations?limit=20", tok)
        if st != 200:
            die(f"list app info localizations: {st} {d}")
        locs = d.get("data", [])
        if dry:
            for loc in locs:
                show(loc["attributes"], APP_INFO_FIELDS,
                     f"app info [{loc['attributes'].get('locale')}]")
        if info_fields:
            print("\napp info:")
            patch_localizations("appInfoLocalizations", locs,
                                info_fields, locale, dry)

    # ---- the review details (contact, demo account, notes to the reviewer).
    # A singleton on the version, and it may not exist yet.
    if ver is not None and (review_fields or dry):
        st, d = api("GET", f"/appStoreVersions/{ver['id']}/appStoreReviewDetail", tok)
        detail = d.get("data") if st == 200 else None
        if dry:
            show((detail or {}).get("attributes", {}), REVIEW_FIELDS,
                 "app review details")
        if review_fields:
            if detail:
                st, d = api("PATCH", f"/appStoreReviewDetails/{detail['id']}", tok, {
                    "data": {"type": "appStoreReviewDetails", "id": detail["id"],
                             "attributes": review_fields}})
                if st not in (200, 201):
                    die(f"patch review details: {st} {d}")
            else:
                st, d = api("POST", "/appStoreReviewDetails", tok, {
                    "data": {"type": "appStoreReviewDetails",
                             "attributes": review_fields,
                             "relationships": {"appStoreVersion": {
                                 "data": {"type": "appStoreVersions", "id": ver["id"]}}}}})
                if st not in (200, 201):
                    die(f"create review details: {st} {d}")
            print(f"\napp review details: wrote {', '.join(sorted(review_fields))}")

    if dry:
        print("\nDRY_RUN — nothing was written. Re-run with dry_run=false to apply.")
    else:
        print("\ndone. The changes are saved on the version but NOT submitted — "
              "run the 'ASC submit release' workflow to send it to review.")


if __name__ == "__main__":
    main()
