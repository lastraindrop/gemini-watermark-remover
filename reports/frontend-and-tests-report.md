# Frontend & Test Audit Report

## 1. Scope

This report covers the browser frontend, its runtime wiring, UX quality, hardcoding and flexibility, important bugs, and the unit test system that now validates the current architecture.

Reviewed areas:

- `public/index.html`
- `public/index.css`
- `src/app.js`
- `src/i18n.js`
- `src/i18n/*.json`
- `tests/frontend_interaction.test.js`
- `tests/frontend_contract.test.js`
- `tests/i18n.test.js`
- `tests/build_pipeline.test.js`
- `tests/test_utils.js`

Current verification status after fixes:

- `tests/frontend_contract.test.js`: 6/6 passing
- `tests/build_pipeline.test.js`: passing
- `tests/i18n.test.js`: passing
- full suite: 203/203 passing

---

## 2. Frontend Architecture

### 2.1 Layering

The browser app is organized into a small but clear layered structure:

- `public/index.html` provides the shell, layout, and entry points.
- `src/app.js` orchestrates UI state, event wiring, queue processing, and rendering.
- `src/core/*` provides the actual watermark logic.
- `src/i18n.js` applies locale-driven text updates.
- `src/utils.js` centralizes image loading, loading overlay, and status messaging.

This is a sensible separation: the page shell is declarative, while the app logic is centralized in one controller-like module.

### 2.2 Design Direction

The current UI clearly reflects the latest system structure:

- profile selector for `gemini` / `doubao`
- deep-scan and noise-reduction toggles
- auto-download toggle
- separate image and directory upload entry points
- directory batch processing flow
- single-image preview and batch-processing preview
- comparison slider and side-by-side comparison views
- audit console / diagnostic status strip

That means the frontend is not just a single-file uploader; it reflects the current multi-profile architecture and the two operational modes: single-image and batch/directory processing.

---

## 3. UI Quality Assessment

### 3.1 What Works Well

The page already has a strong product feel:

- clear hero section
- modern glass-card / gradient treatment
- obvious upload affordance
- explicit steps from input to output
- visible processing feedback
- dual comparison modes after processing
- directory workflow for power users

From a usability perspective, the app makes the intended workflow understandable quickly:

1. choose image(s)
2. select profile / toggles
3. process
4. inspect result
5. download or copy

### 3.2 Where the UI Is Still Dense

The interface is polished, but it is also fairly busy. The main density comes from:

- a large number of controls on the landing panel
- a developer-oriented audit console always present in the shell
- diagnostic status text exposed in the top banner
- multiple comparison modes and batch controls in the same visual hierarchy

That makes the app powerful, but it can feel heavier than necessary for first-time users.

A practical UX improvement would be to collapse the advanced controls into an “Advanced” section or a small disclosure panel, leaving only the minimum actions visible by default.

### 3.3 Accessibility / Clarity

The current UI is good visually, but several labels were mixed-language or hardcoded. After the fixes below, the most visible labels are now localized and the main control labels are consistent.

Remaining UX ideas that would help:

- add `aria-label` text for the comparison controls
- reduce developer diagnostics in production view
- surface profile-specific tips when `doubao` is selected

---

## 4. Hardcoding and Flexibility

### 4.1 Good Dynamic Behavior

The frontend already avoids some hardcoding:

- profiles are populated from `PROFILES`
- languages are populated from `supportedLanguages`
- settings are stored in local storage
- batch processing uses runtime queueing and concurrency
- image history and URLs are tracked dynamically

That means the frontend is not tied to a fixed list of image sizes or a single detection mode.

### 4.2 Remaining Hardcoded Areas

There were still a few hardcoded UI or contract issues:

- the page title and header still presented the tool as Gemini-only / GWR PRO
- the single-image picker and folder picker were coupled through one `webkitdirectory` input
- batch status, toasts, export labels, and detection labels had hardcoded English strings
- the stats view showed a fixed scale value while the engine had the actual detected position and confidence
- the audit console used an inline `onclick` handler

These are now corrected or retargeted to the current structure.

### 4.3 Flexibility Summary

The frontend is flexible enough to support the current architecture, but the long-term improvement path is clear:

- keep visible text fully i18n-driven
- keep DOM hooks stable and contract-tested
- keep runtime behavior driven by profile metadata rather than string literals
- keep build tests validating architecture, not incidental implementation details

---

## 5. Important Bugs Found and Fixed

### 5.1 Coupled File and Folder Picker

**Bug:** The primary `fileInput` had `webkitdirectory directory`, so clicking the main upload area could open a directory picker instead of a normal image picker in Chromium-family browsers.

**Effect:** The default upload path was ambiguous and awkward for the common single-image workflow.

**Fix:** Split the shell into two explicit inputs:

- `fileInput`: image files only
- `folderInput`: directory selection with `webkitdirectory`
- `chooseFileBtn` and `chooseFolderBtn`: explicit user actions

The frontend contract test now locks this separation.

### 5.2 Unsafe Batch Card Rendering

**Bug:** Batch cards rendered `item.name` through an `innerHTML` template.

**Effect:** A crafted local filename could become DOM markup.

**Fix:** Rebuilt batch card creation with DOM APIs and `textContent`, and added a contract test preventing `${item.name}` interpolation inside `innerHTML`.

### 5.3 Batch Error Progress

**Bug:** `processQueue()` advanced progress only through `onSuccess`. `processSingle()` swallowed errors and called `onError`, so failed items did not increment the processed count.

**Effect:** A batch containing failures could leave the progress bar stuck and hide which item failed.

**Fix:** Queue accounting now increments on success and error, the UI renders failed cards, and `Download All` only downloads successful outputs.

### 5.4 Missing Detection Coordinate

**Bug:** The stats view read `config.pos`, but the engine returned `config` and dropped the detected `pos`.

**Effect:** The coordinate field usually displayed `AUTO` even after a successful detection.

**Fix:** `removeWatermarkFromImage()` now returns `pos`; `processSingle()` forwards it; the stats view shows the rounded coordinate and confidence.

### 5.5 Locale and Contract Drift

**Bug:** Several visible labels and toast templates were hardcoded or missing from locale files.

**Effect:** The UI could drift from the current architecture and expose stale English text.

**Fix:** Added brand, upload, toast, batch, detection, and confidence keys across all locale files, and extended `i18n.t()` with general `{{param}}` interpolation.

---

## 6. User Experience Recommendations

These are the most practical improvements for the next iteration.

### 6.1 Good Small Features to Add

- Collapse the audit console by default for normal users, or hide it behind an explicit debug toggle.
- Add a compact “Advanced” disclosure around deep scan, noise reduction, and auto-download.
- Add small inline guidance when `doubao` is selected, especially for the top-left and bottom-right variants.
- Add a clearer batch summary after processing finishes, including count, profile, and average latency.
- Add a “copy processed image” fallback note for browsers that do not support `ClipboardItem`.

### 6.2 High-Value UX Refinements

- Make the default experience simpler for first-time users.
- Keep advanced controls visible only when needed.
- Localize all visible strings, including comparison controls and diagnostic labels.
- Make the file upload and batch flows more obviously distinct.
- Keep the comparison mode labels short and recognizable.

---

## 7. Test System Assessment

### 7.1 Current Test Shape

The test suite now covers:

- core math and reverse alpha blending
- catalog and profile consistency
- Doubao catalog entries and heuristics
- sample-driven Doubao E2E cases
- frontend behavior and UI contracts
- i18n completeness
- build pipeline integrity
- security and input validation
- worker fallback resilience
- queue/concurrency handling
- memory pressure and stress scenarios

### 7.2 Frontend-Focused Coverage

The following is especially relevant to the frontend review:

- `tests/frontend_interaction.test.js` covers end-to-end restoration behavior and profile switching stability.
- `tests/frontend_contract.test.js` now verifies the HTML shell contract directly.
- `tests/i18n.test.js` checks locale completeness and symmetry.
- `tests/build_pipeline.test.js` checks the built web assets.

This is a much better shape than only testing core math, because it prevents the UI shell from drifting away from the current runtime model.

### 7.3 Parameter Coverage

`tests/test_utils.js::generateParameterMatrix()` now expands across all catalog entries instead of sampling only one entry per profile.

That is important because it reduces hidden bias in the tests:

- catalog-driven architecture is validated across all supported sizes
- Doubao is no longer under-sampled
- test data is closer to the real operational matrix

### 7.4 What the Tests Still Should Avoid

A few rules are now clear for future test work:

- do not hardcode a single resolution when catalog entries are available
- do not assert implementation details that are not part of the public contract
- do not duplicate the same scenario across many nearly identical tests
- prefer contract checks on the HTML shell and locale files when the issue is UI-related

---

## 8. Validation Results

After the frontend fixes and test updates:

- browser page loads successfully from `dist/index.html`
- the app initializes without the previous null-reference crash
- locale labels now render as text instead of raw keys
- the build pipeline test now matches current bundle behavior
- the full suite passes: `203/203`

That means the frontend is now structurally aligned with the current architecture, and the test suite is aligned with the actual application contract.

---

## 9. Bottom Line

The frontend is already strong in visual polish and workflow clarity, but it had several important contract-level problems:

- single-image upload and directory upload were bound to the same input
- batch card rendering interpolated filenames into HTML
- failed batch items did not advance progress
- detection coordinates were not returned to the stats view
- incomplete i18n coverage exposed raw or stale labels in the UI

Both are now fixed. The test suite has also been tightened so it now validates the real frontend contract instead of stale assumptions.

The next good UX step is not more visual decoration. It is simplification: reduce the amount of visible advanced control surface, keep the core path obvious, and keep the developer diagnostics behind an optional layer.
