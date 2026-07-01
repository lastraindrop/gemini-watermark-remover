import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

const t = name => `tests/${name}.test.js`;

export const PRIMARY_GROUPS = ['unit', 'integration', 'precision', 'audit', 'diagnostic', 'stress'];
export const STANDARD_GROUPS = ['unit', 'integration', 'precision', 'audit'];

export const TEST_GROUPS = Object.freeze({
    unit: [
        t('adaptive_detector'),
        t('adaptive_min_adjusted_score'),
        t('alpha_calibration'),
        t('alpha_map_formula'),
        t('alpha_noise_floor_configurable'),
        t('alpha_resource_96_20260520'),
        t('anchor_preservation'),
        t('app_layer'),
        t('apply_removal_strategy'),
        t('architecture_gaps'),
        t('blendModes'),
        t('box_blur'),
        t('candidate_validation'),
        t('candidate_geometry'),
        t('catalog'),
        t('catalog_new_entries'),
        t('catalog_new_tiers_reachable'),
        t('color_space'),
        t('config'),
        t('core_math'),
        t('decision_policy'),
        t('detection_subpixel_position'),
        t('detector_scoring'),
        t('diff_artifacts_wiring'),
        t('documentation_contract'),
        t('edge_cases'),
        t('gemini_regression'),
        t('heuristic_returns_new_tier'),
        t('i18n_completeness'),
        t('manual_selection'),
        t('memory_queue'),
        t('metrics_precision'),
        t('multi_dimension_scoring'),
        t('multi_pass_non_gemini'),
        t('multiPass_removal'),
        t('parameter_overrides'),
        t('p0_user_feedback_regression'),
        t('performance_preset_override'),
        t('position_offset_tolerance'),
        t('profiles_new_tiers'),
        t('recalibration_actually_fires'),
        t('recalibration_type_match'),
        t('refine_rectangular'),
        t('registry'),
        t('sdk_api'),
        t('setup_contract'),
        t('subpixel'),
        t('subpixel_interpolation'),
        t('template_resolution'),
        t('test_groups_contract'),
        t('threshold_sot_integrity'),
        t('weak_alpha_chain'),
        t('python_timeout_scales')
    ],
    integration: [
        t('build_pipeline'),
        t('cli.integration'),
        t('detector'),
        t('engine_lifecycle'),
        t('frontend_contract'),
        t('object_url_lifecycle'),
        t('pipeline'),
        t('subpixel_integration'),
        t('watermarkEngine'),
        t('worker_resilience'),
        t('worker_timeout_recovery')
    ],
    precision: [
        t('detection_doubao_rectangular_alpha_map'),
        t('detection_gemini_standard_positions'),
        t('detection_non_catalog_scaled'),
        t('detection_offset_tolerance'),
        t('detection_recall'),
        t('doubao'),
        t('e2e_integration'),
        t('parameter_matrix'),
        t('real_sample'),
        t('removal_alpha_gain_stability'),
        t('removal_precision_gradient_background')
    ],
    audit: [
        t('product_audit')
    ],
    diagnostic: [
        t('detection_fallback_chain'),
        t('diagnostic_baseline'),
        t('frontend_interaction')
    ],
    stress: [
        t('memory_pressure'),
        t('product_audit_stress')
    ],
    legacy: [
        'tests/scripts/v1.5_edge_crop.test.js',
        'tests/scripts/v1.5_noise_reduction.test.js'
    ],
    worker: [
        t('engine_lifecycle'),
        t('worker_resilience'),
        t('worker_timeout_recovery')
    ]
});

export function discoverTopLevelTests() {
    return readdirSync(resolve(PROJECT_ROOT, 'tests'))
        .filter(name => name.endsWith('.test.js'))
        .map(name => `tests/${name}`)
        .sort();
}

export function collectGroupFiles(group) {
    if (group === 'all') {
        const files = STANDARD_GROUPS.flatMap(name => TEST_GROUPS[name]);
        return [...new Set([...files, ...TEST_GROUPS.legacy])];
    }
    if (group === 'exhaustive') {
        return [...discoverTopLevelTests(), ...TEST_GROUPS.legacy];
    }
    return TEST_GROUPS[group] || null;
}

export function validateTestGroups() {
    const discovered = discoverTopLevelTests();
    const primaryFiles = new Map();
    const missingFiles = [];

    for (const group of [...PRIMARY_GROUPS, 'legacy', 'worker']) {
        for (const file of TEST_GROUPS[group]) {
            if (!existsSync(resolve(PROJECT_ROOT, file))) {
                missingFiles.push(file);
            }
        }
    }

    for (const group of PRIMARY_GROUPS) {
        for (const file of TEST_GROUPS[group]) {
            const owners = primaryFiles.get(file) || [];
            owners.push(group);
            primaryFiles.set(file, owners);
        }
    }

    const unassigned = discovered.filter(file => !primaryFiles.has(file));
    const duplicates = [...primaryFiles.entries()]
        .filter(([, owners]) => owners.length > 1)
        .map(([file, owners]) => ({ file, owners }));

    return { discovered, missingFiles, unassigned, duplicates };
}

export function buildNodeTestArgs(group, options = {}) {
    const files = collectGroupFiles(group);
    if (!files) {
        throw new Error(`Unknown test group: ${group}`);
    }

    const {
        canvasMock = true,
        concurrency = (group === 'stress' || group === 'exhaustive') ? 1 : (group === 'integration' ? 2 : 4),
        reporter = null,
        passthrough = []
    } = options;

    const args = [];
    if (group === 'stress' || group === 'exhaustive') {
        args.push('--import', './scripts/stress-env.mjs');
    }
    if (canvasMock) {
        args.push('--import', './tests/fixtures/canvas-mock.mjs');
    }
    args.push('--loader', './tests/fixtures/png-loader.mjs');
    args.push('--test');
    args.push(`--test-concurrency=${concurrency}`);
    if (group === 'integration' || group === 'exhaustive') {
        args.push('--test-timeout=600000');
    }
    if (reporter) {
        args.push(`--test-reporter=${reporter}`);
    }
    args.push(...passthrough);
    args.push(...files);
    return args;
}

function parseArgs(argv) {
    const options = {
        group: null,
        canvasMock: true,
        concurrency: null,
        reporter: null,
        passthrough: [],
        list: false,
        dryRun: false
    };

    for (const arg of argv) {
        if (arg === '--list') {
            options.list = true;
        } else if (arg === '--dry-run') {
            options.dryRun = true;
        } else if (arg === '--no-canvas-mock') {
            options.canvasMock = false;
        } else if (arg.startsWith('--concurrency=')) {
            options.concurrency = Number.parseInt(arg.split('=')[1], 10);
        } else if (arg.startsWith('--reporter=')) {
            options.reporter = arg.split('=')[1];
        } else if (arg.startsWith('--')) {
            options.passthrough.push(arg);
        } else if (!options.group) {
            options.group = arg;
        } else {
            options.passthrough.push(arg);
        }
    }

    return options;
}

function printGroups() {
    const rows = ['all', 'exhaustive', ...Object.keys(TEST_GROUPS)].map(group => {
        const files = collectGroupFiles(group) || [];
        return `${group.padEnd(12)} ${String(files.length).padStart(3)} files`;
    });
    console.log(rows.join('\n'));
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.list) {
        printGroups();
        return;
    }

    const group = options.group || 'unit';
    const validation = validateTestGroups();
    if (validation.missingFiles.length > 0 || validation.unassigned.length > 0 || validation.duplicates.length > 0) {
        console.error('Test group validation failed.');
        if (validation.missingFiles.length) console.error(`Missing files: ${validation.missingFiles.join(', ')}`);
        if (validation.unassigned.length) console.error(`Unassigned tests: ${validation.unassigned.join(', ')}`);
        if (validation.duplicates.length) {
            console.error(`Duplicate primary assignments: ${validation.duplicates.map(d => `${d.file}(${d.owners.join('+')})`).join(', ')}`);
        }
        process.exitCode = 1;
        return;
    }

    const args = buildNodeTestArgs(group, {
        canvasMock: options.canvasMock,
        concurrency: options.concurrency || undefined,
        reporter: options.reporter,
        passthrough: options.passthrough
    });

    if (options.dryRun) {
        console.log([process.execPath, ...args].join(' '));
        return;
    }

    const result = spawnSync(process.execPath, args, {
        cwd: PROJECT_ROOT,
        env: process.env,
        stdio: 'inherit'
    });
    process.exitCode = result.status ?? 1;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
    main();
}
