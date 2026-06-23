# Frontend & Test Audit Report

## 1. Current Scope

This report summarizes the current frontend and test architecture after the v2.7 closure. Detailed closure notes are in `reports/v2.7-finalization-report.md`.

Reviewed areas:

- `public/index.html`
- `src/app/*.js`
- `src/i18n/*.json`
- `tests/frontend_contract.test.js`
- `tests/frontend_interaction.test.js`
- `tests/manual_selection.test.js`
- `tests/test_groups_contract.test.js`
- `scripts/test-groups.mjs`

## 2. Frontend Status

- Production UI exposes Gemini, Doubao, and Auto.
- Experimental profiles are not presented as production support.
- Manual selection defaults to template `auto`.
- Doubao manual selections can use rectangular `widthxheight` asset keys.
- Batch UI and mobile toast layout are stable.
- Compare controls are real buttons with accessible pressed state.
- i18n keys are synchronized across supported locales.

## 3. Test Status

The test suite is now grouped by purpose:

- `unit`
- `integration`
- `precision`
- `audit`
- `diagnostic`
- `stress`
- `legacy`
- `worker`

`scripts/test-groups.mjs` validates that top-level tests are assigned exactly once. `tests/test_groups_contract.test.js` prevents future drift.

## 4. Remaining Watchpoints

- Add browser-level Playwright tests for real UI interactions.
- Keep profile labels, i18n keys, and engine option construction aligned.
- Keep diagnostic and stress tests out of the default developer loop.
- Expand real-sample fixtures for difficult Gemini offsets and Doubao variants.

## 5. Conclusion

The frontend and tests now reflect the current architecture. The main remaining gap is browser-level E2E coverage, not unit or integration coverage.
