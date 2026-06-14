# Frontend & Test Audit Report

## 1. Scope

This report covers the browser frontend, its runtime wiring, UX quality, drag-and-drop behavior, batch download behavior, and the unit test coverage that validates the current architecture.

Reviewed areas:

- `public/index.html`
- `public/index.css`
- `src/app.js`
- `src/app/processing.js`
- `src/i18n.js`
- `src/i18n/*.json`
- `tests/frontend_contract.test.js`
- `tests/frontend_interaction.test.js`
- `tests/gemini_regression.test.js`
- `tests/i18n.test.js`
- `tests/build_pipeline.test.js`

Current verification status (v2.5.1):

- `tests/frontend_contract.test.js`: passing
- `tests/build_pipeline.test.js`: passing
- `tests/i18n_completeness.test.js`: passing
- full suite: 44 files, 417 test cases

## 2. Frontend Architecture

- `public/index.html` provides the shell and entry points.
- `src/app.js` handles state, event wiring, drag-and-drop, and upload flow.
- `src/app/processing.js` handles queueing, concurrency, and downloads.
- `src/core/*` provides the actual watermark logic.
- `src/i18n.js` applies locale-driven text updates.

The frontend now reflects the current multi-profile architecture instead of a single hardcoded workflow.

## 3. Key Findings

- Window-level drag-and-drop is now wired.
- Directory drag-and-drop is handled.
- Batch downloads are packaged as ZIP files.
- Language select styling now remains readable.
- Batch queueing yields to the browser more often, reducing visible lag.

## 4. Remaining UX Watchpoints

- Keep the control surface dense but stable.
- Avoid reintroducing per-file browser download fan-out.
- Keep frontend labels aligned with the actual engine parameters.

## 5. Conclusion

The frontend is now aligned with the current architecture and test baseline. The main risk is regression through future refactors that touch the upload/download pipeline or the shared parameter contract.
