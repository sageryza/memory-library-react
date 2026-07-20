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

# Anchor on the ImageForge target's bundle id, NOT the first `base:` block or a
# file-wide key search — project.yml now holds multiple app targets (e.g.
# SecretlyAWitch bakes its own INFOPLIST_KEY_CFBundleDisplayName in), so both
# old heuristics would misfire.
marker = "        PRODUCT_BUNDLE_IDENTIFIER: com.sageryza.imageforge\n"
if marker not in s:
    print(f"::error::could not find the ImageForge bundle id line in {path}")
    sys.exit(1)

if marker + "        INFOPLIST_KEY_CFBundleDisplayName" in s:
    print(f"{path} already patched — nothing to do.")
    sys.exit(0)

ipad_orientations = (
    "UIInterfaceOrientationPortrait UIInterfaceOrientationPortraitUpsideDown "
    "UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight"
)
inject = (
    f'        INFOPLIST_KEY_CFBundleDisplayName: "{display}"\n'
    f"        INFOPLIST_KEY_ITSAppUsesNonExemptEncryption: NO\n"
    f"        ASSETCATALOG_COMPILER_APPICON_NAME: AppIcon\n"
    f"        INFOPLIST_KEY_UISupportedInterfaceOrientations_iPhone: UIInterfaceOrientationPortrait\n"
    f'        INFOPLIST_KEY_UISupportedInterfaceOrientations_iPad: "{ipad_orientations}"\n'
)
s = s.replace(marker, marker + inject, 1)  # right below the ImageForge bundle id
with open(path, "w") as f:
    f.write(s)
print(f"Patched {path}: home-screen name '{display}', auto export-compliant.")
