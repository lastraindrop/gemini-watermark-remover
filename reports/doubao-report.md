# Doubao Watermark Support Report

## 1. Current Support

Doubao is a production profile in the current branch.

Supported anchors:

- `top-left`
- `bottom-right`

Supported shape:

- Rectangular watermarks.
- Asset dimensions are derived from profile/catalog metadata.
- Manual selections can produce explicit `widthxheight` asset keys.

## 2. Architecture

Doubao uses the same shared pipeline as Gemini:

1. Catalog and heuristic candidates.
2. Adaptive search when needed.
3. Candidate validation and anchor preservation.
4. Shared `applyRemovalStrategy()`.
5. Multi-pass removal with safety gates.

There is no separate Doubao-only removal path.

## 3. Test Coverage

Relevant tests include:

- `tests/doubao.test.js`
- `tests/real_sample.test.js`
- `tests/parameter_matrix.test.js`
- `tests/product_audit.test.js`
- `tests/manual_selection.test.js`
- `tests/setup_contract.test.js`

Doubao coverage is included in the `precision`, `audit`, and standard `test:all` gates.

## 4. Maintenance Rules

- Any Doubao anchor or dimension change must update `profiles.js`, `catalogs.json`, tests, and docs together.
- Do not duplicate `401x173` or `307x167` in new tests. Use shared helpers that derive dimensions from profile metadata.
- Add a real sample before documenting a new Doubao variant as supported.
