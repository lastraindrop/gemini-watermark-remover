# Doubao Watermark Support Report

## 1. Goal

This report documents Doubao watermark support in the current branch and records the current directory/catalog coverage.

## 2. Current Support

`src/core/profiles.js` and `src/core/catalog.js` now cover the current Doubao multi-anchor flow.

Supported anchors:

- `top-left`
- `bottom-right`

Supported catalog entries include the main square and portrait/landscape resolutions used by the current sample set.

## 3. Verification Summary

- The current support path is shared by Web, CLI, and Python bridge.
- Detection and removal use the same candidate policy as Gemini.
- Current local verification baseline is `369/369` passing (v2.1.0). Updated baseline: `452/452` (v2.2.0).

## 4. Key Notes

- Doubao is intentionally handled through the same shared pipeline rather than a separate code path.
- Any change to anchor or catalog coverage must be mirrored in tests.
- If a new Doubao sample appears, it should be added to the regression set before the documentation is updated.
