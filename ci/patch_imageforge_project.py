#!/usr/bin/env python3
"""Patch ImageForge's xcodegen project.yml at build time.

ImageForge lives in another repo we can't edit directly, so we tweak its
project.yml on the runner before `xcodegen generate`:
  - INFOPLIST_KEY_CFBundleDisplayName — the home-screen label (e.g. "Deck Factory")
  - INFOPLIST_KEY_ITSAppUsesNonExemptEncryption: NO — makes TestFlight builds
    auto-compliant (no manual "Missing Compliance" toggle).

Idempotent: re-running won't double-insert.
"""
import os
import sys

path = os.environ.get("PROJECT_YML", "ios/project.yml")
display = os.environ.get("DISPLAY_NAME", "Deck Factory")

with open(path) as f:
    s = f.read()

if "INFOPLIST_KEY_CFBundleDisplayName" in s:
    print(f"{path} already patched — nothing to do.")
    sys.exit(0)

marker = "      base:\n"
if marker not in s:
    print(f"::error::could not find target settings 'base:' in {path}")
    sys.exit(1)

inject = (
    f'        INFOPLIST_KEY_CFBundleDisplayName: "{display}"\n'
    f"        INFOPLIST_KEY_ITSAppUsesNonExemptEncryption: NO\n"
)
s = s.replace(marker, marker + inject, 1)
with open(path, "w") as f:
    f.write(s)
print(f"Patched {path}: home-screen name '{display}', auto export-compliant.")
