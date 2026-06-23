import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
    TEST_GROUPS,
    PRIMARY_GROUPS,
    STANDARD_GROUPS,
    collectGroupFiles,
    validateTestGroups
} from '../scripts/test-groups.mjs';

describe('Test Group Contracts', () => {
    test('primary groups cover every top-level JS test exactly once', () => {
        const validation = validateTestGroups();
        assert.deepStrictEqual(validation.missingFiles, []);
        assert.deepStrictEqual(validation.unassigned, []);
        assert.deepStrictEqual(validation.duplicates, []);
    });

    test('unit group excludes slow integration and audit suites', () => {
        const unitFiles = new Set(TEST_GROUPS.unit);
        for (const file of [
            'tests/parameter_matrix.test.js',
            'tests/product_audit.test.js',
            'tests/diagnostic_baseline.test.js',
            'tests/e2e_integration.test.js',
            'tests/cli.integration.test.js',
            'tests/memory_pressure.test.js'
        ]) {
            assert.equal(unitFiles.has(file), false, `${file} should not run in test:unit`);
        }
    });

    test('all group includes standard verification layers and legacy tests', () => {
        const allFiles = new Set(collectGroupFiles('all'));
        for (const group of STANDARD_GROUPS) {
            for (const file of TEST_GROUPS[group]) {
                assert.ok(allFiles.has(file), `all group must include ${group} file ${file}`);
            }
        }
        for (const file of TEST_GROUPS.legacy) {
            assert.ok(allFiles.has(file), `all group must include legacy file ${file}`);
        }
        for (const file of [...TEST_GROUPS.diagnostic, ...TEST_GROUPS.stress]) {
            assert.equal(allFiles.has(file), false, `${file} should stay in its dedicated group`);
        }
    });

    test('exhaustive group includes every primary group and legacy test', () => {
        const exhaustiveFiles = new Set(collectGroupFiles('exhaustive'));
        for (const group of PRIMARY_GROUPS) {
            for (const file of TEST_GROUPS[group]) {
                assert.ok(exhaustiveFiles.has(file), `exhaustive group must include ${group} file ${file}`);
            }
        }
        for (const file of TEST_GROUPS.legacy) {
            assert.ok(exhaustiveFiles.has(file), `exhaustive group must include legacy file ${file}`);
        }
    });
});
