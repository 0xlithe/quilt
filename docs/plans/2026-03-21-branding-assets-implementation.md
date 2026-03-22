# Quilt Branding Assets Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a polished Quilt icon set, preserve the full logo asset, and update extension metadata and popup branding to match the new identity.

**Architecture:** Keep branding changes narrowly scoped to static assets plus the two surfaces that expose product identity today: `extension/manifest.json` and `extension/ui/popup.html`. Use the provided PNG as the brand source, derive symbol-only icon variants for extension sizes, and leave task logic untouched.

**Tech Stack:** Manifest V3 Chrome extension, HTML/CSS, static PNG assets, local image processing via shell tooling.

---

### Task 1: Add the brand asset files

**Files:**
- Create: `extension/assets/logo-full.png`
- Create: `extension/assets/icon-16.png`
- Create: `extension/assets/icon-32.png`
- Create: `extension/assets/icon-48.png`
- Create: `extension/assets/icon-128.png`
- Create: `extension/assets/favicon.png`

**Step 1: Prepare the source image**

Run: copy the provided Quilt PNG into `extension/assets/logo-full.png`
Expected: the extension has a stable in-repo full logo asset.

**Step 2: Generate symbol-focused icon variants**

Run: derive centered icon sizes from the wave mark portion of the source image
Expected: legible icons at `16`, `32`, `48`, and `128`.

**Step 3: Verify the files exist**

Run: list `extension/assets/`
Expected: all icon files plus `logo-full.png`

### Task 2: Update extension metadata

**Files:**
- Modify: `extension/manifest.json`

**Step 1: Update name-facing metadata**

Set:
- a more professional `description`
- `action.default_title`
- `icons`
- `action.default_icon`

**Step 2: Verify the JSON remains valid**

Run: a JSON parse check against `extension/manifest.json`
Expected: valid JSON

### Task 3: Brand the popup surface

**Files:**
- Modify: `extension/ui/popup.html`

**Step 1: Add icon hooks**

Include:
- favicon link
- branded header image using the full Quilt logo

**Step 2: Refine copy and spacing**

Keep the existing controls, but make the header and supporting text feel more product-like.

**Step 3: Verify the popup still renders**

Run: inspect the markup and confirm no broken paths or malformed HTML
Expected: popup remains valid and readable

### Task 4: Verify and lint

**Files:**
- Modify: `extension/manifest.json`
- Modify: `extension/ui/popup.html`

**Step 1: Run a file-level verification**

Run:
- JSON parse check for `extension/manifest.json`
- asset existence check for `extension/assets/`

Expected: success

**Step 2: Check diagnostics**

Run: Cursor lints for:
- `extension/manifest.json`
- `extension/ui/popup.html`

Expected: no new issues introduced
