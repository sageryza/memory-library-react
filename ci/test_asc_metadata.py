#!/usr/bin/env python3
"""Offline test for ci/asc_metadata.py — stubs the ASC API and checks the
routing, validation and dry-run behaviour without touching a real listing."""
import io, json, os, sys, contextlib, types

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# --- stub the API before asc_metadata imports it -------------------------
calls = []
STATE = {"ver_state": "REJECTED", "no_contact": False}


def fake_token():
    return "tok"


def fake_api(method, path, tok, body=None):
    calls.append((method, path, body))
    if path.startswith("/apps?filter[bundleId]"):
        return 200, {"data": [{"id": "APP1", "attributes": {"name": "Secretly a Witch"}}]}
    if path.startswith("/apps/APP1/appStoreVersions"):
        return 200, {"data": [
            {"id": "V9", "attributes": {"versionString": "1.0",
                                        "appVersionState": STATE["ver_state"]}},
            {"id": "V8", "attributes": {"versionString": "0.9",
                                        "appVersionState": "READY_FOR_SALE"}}]}
    if path.startswith("/appStoreVersions/V9/appStoreVersionLocalizations"):
        return 200, {"data": [{"id": "L1", "attributes": {
            "locale": "en-US", "description": "old desc", "keywords": "a,b",
            "whatsNew": None, "promotionalText": None,
            "supportUrl": "https://x", "marketingUrl": None}}]}
    if path.startswith("/apps/APP1/appInfos"):
        return 200, {"data": [
            {"id": "I_live", "attributes": {"state": "READY_FOR_SALE"}},
            {"id": "I_edit", "attributes": {"state": "REJECTED"}}]}
    if path.startswith("/appInfos/I_edit/appInfoLocalizations"):
        return 200, {"data": [{"id": "AL1", "attributes": {
            "locale": "en-US", "name": "Secretly a Witch", "subtitle": "old sub",
            "privacyPolicyUrl": None, "privacyPolicyText": None}}]}
    if path.startswith("/appStoreVersions/V9/appStoreReviewDetail") and STATE["no_contact"]:
        return 200, {"data": {"id": "RD1", "attributes": {"notes": "old notes"}}}
    if path.startswith("/appStoreVersions/V8/appStoreReviewDetail"):
        return 200, {"data": None}
    if path.startswith("/appStoreVersions/V9/appStoreReviewDetail"):
        return 200, {"data": {"id": "RD1", "attributes": {
            "notes": "old notes", "contactEmail": "sophie@example.com",
            "contactFirstName": "Test", "contactLastName": "Person",
            "contactPhone": "15555550123",
            "demoAccountPassword": "hunter2secret"}}}
    if method in ("PATCH", "POST"):
        return 200, {"data": {"id": "new"}}
    # the read-only "before submitting" block of a dry run
    if path.startswith("/appStoreVersions/V9?fields"):
        return 200, {"data": {"id": "V9", "attributes": {"copyright": None}}}
    if path.startswith("/appInfos/I_edit/primaryCategory"):
        return 200, {"data": None}
    if path.startswith("/appInfos/I_edit/ageRatingDeclaration"):
        return 200, {"data": {"id": "AR1", "attributes": {
            "gambling": False, "horrorOrFearThemes": None, "unrestrictedWebAccess": None}}}
    if path.startswith("/apps/APP1/appPriceSchedule"):
        return 404, {"errors": [{"code": "NOT_FOUND"}]}
    if path.startswith("/apps/APP1/appAvailabilityV2"):
        return 403, {"errors": [{"code": "FORBIDDEN.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED"}]}
    if path.startswith("/appStoreVersionLocalizations/L1/appScreenshotSets"):
        return 200, {"data": [{"id": "SS1", "attributes": {"screenshotDisplayType": "APP_IPHONE_67"}}]}
    if path.startswith("/appScreenshotSets/SS1/appScreenshots"):
        return 200, {"data": [{"id": "a"}, {"id": "b"}]}
    if path.startswith("/appStoreVersions/V9/build"):
        return 200, {"data": None}
    if path.startswith("/builds?filter[app]=APP1"):
        return 200, {"data": [{"id": "B39", "attributes": {
            "version": "39", "processingState": "VALID", "expired": False,
            "uploadedDate": "2026-10-15T13:24:00-07:00"}}]}
    if path.startswith("/reviewSubmissions?filter[app]=APP1"):
        return 200, {"data": []}
    raise AssertionError(f"unstubbed {method} {path}")


stub = types.ModuleType("setup_internal_testing")
stub.token = fake_token
stub.api = fake_api
sys.modules["setup_internal_testing"] = stub

import asc_metadata  # noqa: E402

BASE_ENV = {"ASC_KEY_ID": "k", "ASC_ISSUER_ID": "i", "ASC_KEY_P8": "p",
            "APP_BUNDLE_ID": "com.sageryza.secretlyawitch"}
FIELD_ENVS = ["GITHUB_ACTIONS", "VERSION_STRING", "LOCALE", "DRY_RUN", "FIELDS_JSON",
              "DESCRIPTION", "KEYWORDS", "SUBTITLE", "PROMOTIONAL_TEXT",
              "WHATS_NEW", "REVIEW_NOTES"]


def run(**env):
    calls.clear()
    for k in FIELD_ENVS:
        os.environ.pop(k, None)
    os.environ.update(BASE_ENV)
    os.environ.update({k: str(v) for k, v in env.items()})
    out = io.StringIO()
    code = 0
    try:
        with contextlib.redirect_stdout(out):
            asc_metadata.main()
    except SystemExit as e:
        code = e.code
    return code, out.getvalue()


fails = []


def check(name, cond, detail=""):
    print(("  ok  " if cond else "  FAIL") + f"  {name}" + (f"  {detail}" if not cond and detail else ""))
    if not cond:
        fails.append(name)


print("1. dry run reads everything, writes nothing")
code, out = run(DRY_RUN="true")
check("exits clean", code == 0, f"code={code}")
check("shows current description", "old desc" in out)
check("shows current subtitle", "old sub" in out)
check("shows current review notes", "old notes" in out)
check("picked the editable version", "V9" in out and "state=REJECTED" in out)
check("picked the editable app info", "I_edit" in out)
check("no writes issued", not [c for c in calls if c[0] in ("PATCH", "POST")],
      str([c[:2] for c in calls if c[0] != "GET"]))
check("says nothing was written", "nothing was written" in out)

print("2. a real write routes each field to the right resource")
code, out = run(DRY_RUN="false", DESCRIPTION="a new description",
                SUBTITLE="new sub", REVIEW_NOTES="hi reviewer")
writes = [c for c in calls if c[0] in ("PATCH", "POST")]
paths = [c[1] for c in writes]
check("exits clean", code == 0, f"code={code} out={out}")
check("description -> version localization",
      "/appStoreVersionLocalizations/L1" in paths, str(paths))
check("subtitle -> app info localization",
      "/appInfoLocalizations/AL1" in paths, str(paths))
check("notes -> review details", "/appStoreReviewDetails/RD1" in paths, str(paths))
vloc = next(c for c in writes if c[1] == "/appStoreVersionLocalizations/L1")
check("version patch carries ONLY its own fields",
      set(vloc[2]["data"]["attributes"]) == {"description"},
      str(vloc[2]["data"]["attributes"]))
iloc = next(c for c in writes if c[1] == "/appInfoLocalizations/AL1")
check("app info patch carries ONLY its own fields",
      set(iloc[2]["data"]["attributes"]) == {"subtitle"},
      str(iloc[2]["data"]["attributes"]))
check("reminds that it is not submitted", "NOT submitted" in out)

print("3. untouched fields are never sent")
code, out = run(DRY_RUN="false", KEYWORDS="witch,tarot,moon")
writes = [c for c in calls if c[0] in ("PATCH", "POST")]
check("one write only", len(writes) == 1, str([c[1] for c in writes]))
check("only keywords in it",
      set(writes[0][2]["data"]["attributes"]) == {"keywords"})

print("4. FIELDS_JSON reaches fields with no input of their own, and clears")
code, out = run(DRY_RUN="false",
                FIELDS_JSON=json.dumps({"supportUrl": "https://secretlyawitch.com",
                                        "promotionalText": ""}))
writes = [c for c in calls if c[0] in ("PATCH", "POST")]
attrs = writes[0][2]["data"]["attributes"]
check("supportUrl written", attrs.get("supportUrl") == "https://secretlyawitch.com")
check("empty string clears promo text", attrs.get("promotionalText") == "")

print("5. validation refuses bad input before touching the API")
code, out = run(DRY_RUN="false", SUBTITLE="x" * 31)
check("over-length subtitle rejected", code == 1 and "limit is 30" in out, out)
code, out = run(DRY_RUN="false", FIELDS_JSON='{"descriptio":"typo"}')
check("unknown field rejected", code == 1 and "unknown field" in out, out)
code, out = run(DRY_RUN="false", FIELDS_JSON="{not json")
check("bad JSON rejected", code == 1 and "not valid JSON" in out, out)
code, out = run(DRY_RUN="false")
check("write with no fields refused", code == 1 and "nothing to write" in out, out)

print("6. a live version cannot be edited by accident")
STATE["ver_state"] = "READY_FOR_SALE"
code, out = run(DRY_RUN="false", DESCRIPTION="nope")
check("no editable version -> hard stop", code == 1 and "no editable version" in out, out)
code, out = run(DRY_RUN="false", VERSION_STRING="1.0", DESCRIPTION="nope")
check("explicit live version -> hard stop",
      code == 1 and "does not allow metadata edits" in out, out)
STATE["ver_state"] = "REJECTED"

code, out = run(DRY_RUN="false", VERSION_STRING="7.7", DESCRIPTION="nope")
check("missing version names what exists", code == 1 and "1.0" in out, out)

print("7. a dry run never prints secrets — these logs are PUBLIC")
code, out = run(DRY_RUN="true")
check("demo password not printed", "hunter2secret" not in out, out)
check("says it is hidden and why", "hidden, this log is public" in out)
check("but confirms it is set", "13 chars" in out)
check("phone shown as last 4 only",
      "15555550123" not in out and "…0123" in out, out)
check("email domain kept, user masked",
      "sophie@example.com" not in out and "so…@example.com" in out, out)

print("8. copyContactFrom copies the contact without printing it")
code, out = run(DRY_RUN="false", FIELDS_JSON=json.dumps(
    {"copyContactFrom": "com.sageryza.secretlyawitch", "demoAccountRequired": False}))
writes = [c for c in calls if c[0] in ("PATCH", "POST")]
check("exits clean", code == 0, f"code={code} out={out}")
check("one write, to the review details",
      [c[1] for c in writes] == ["/appStoreReviewDetails/RD1"], str([c[1] for c in writes]))
attrs = writes[0][2]["data"]["attributes"] if writes else {}
check("all four contact fields copied",
      attrs.get("contactPhone") == "15555550123" and attrs.get("contactEmail") == "sophie@example.com"
      and attrs.get("contactFirstName") == "Test" and attrs.get("contactLastName") == "Person", str(attrs))
check("the other fields ride along", attrs.get("demoAccountRequired") is False, str(attrs))
check("notes and demo account are not copied",
      "notes" not in attrs and "demoAccountPassword" not in attrs, str(attrs))
check("full phone and email never printed",
      "15555550123" not in out and "sophie@example.com" not in out and "…0123" in out, out)
code, out = run(DRY_RUN="false", FIELDS_JSON=json.dumps(
    {"copyContactFrom": "com.sageryza.secretlyawitch", "contactEmail": "other@example.com"}))
writes = [c for c in calls if c[0] in ("PATCH", "POST")]
check("a field passed explicitly wins over the copy",
      writes and writes[0][2]["data"]["attributes"].get("contactEmail") == "other@example.com", out)
code, out = run(DRY_RUN="true", FIELDS_JSON=json.dumps({"copyContactFrom": "com.sageryza.secretlyawitch"}))
check("a dry run copies nothing", code == 0 and not [c for c in calls if c[0] in ("PATCH", "POST")], out)
check("and shows what it would copy, redacted",
      "contact copied from com.sageryza.secretlyawitch" in out and "15555550123" not in out, out)
code, out = run(DRY_RUN="false", FIELDS_JSON=json.dumps({"copyContactFrom": ""}))
check("an empty bundle id is refused", code == 1 and "must be a bundle id" in out, out)
code, out = run(DRY_RUN="true", GITHUB_ACTIONS="true",
                FIELDS_JSON=json.dumps({"copyContactFrom": "com.sageryza.secretlyawitch"}))
masks = [l for l in out.splitlines() if l.startswith("::add-mask::")]
check("on GitHub the copied phone and email are masked for the rest of the log",
      sorted(masks) == ["::add-mask::15555550123", "::add-mask::sophie@example.com"], str(masks))
check("and nothing else prints them",
      "15555550123" not in "\n".join(l for l in out.splitlines() if not l.startswith("::add-mask::")), out)
os.environ.pop("GITHUB_ACTIONS", None)
STATE["no_contact"] = True
code, out = run(DRY_RUN="false", FIELDS_JSON=json.dumps({"copyContactFrom": "com.sageryza.xi"}))
check("an app with no contact is refused, nothing written",
      code == 1 and "no App Review contact" in out
      and not [c for c in calls if c[0] in ("PATCH", "POST")], out)
STATE["no_contact"] = False

print("9. a dry run also reads what is missing before submitting, and writes nothing")
code, out = run(DRY_RUN="true")
check("exits clean", code == 0, f"code={code} out={out}")
check("no writes issued", not [c for c in calls if c[0] in ("PATCH", "POST")])
for line in ("content rights: (unset)", "copyright: (unset)", "primary category: (unset)",
             "age rating: 1 of 3 answers set; unset: horrorOrFearThemes, unrestrictedWebAccess",
             "price: 404 NOT_FOUND",
             "availability: 403 FORBIDDEN.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED",
             "screenshots [en-US]: APP_IPHONE_67 x2", "build on this version: none",
             "build 39: VALID", "review submissions: none", "App Privacy: not in Apple's API"):
    check(f"says '{line}'", line in out, out)
code, out = run(DRY_RUN="false", KEYWORDS="witch,tarot,moon")
check("a write does not run the reads",
      "before submitting" not in out and not [c for c in calls if "/primaryCategory" in c[1]], out)

print()
print("FAILED: " + ", ".join(fails) if fails else "all checks passed")
sys.exit(1 if fails else 0)
