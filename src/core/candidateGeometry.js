const DEFAULT_OVERLAP_THRESHOLD = 0.25;

export function getCandidateRect(candidate) {
    const rect = candidate?.pos || candidate;
    if (!rect) return null;
    const { x, y, width, height } = rect;
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
    return { x, y, width, height };
}

export function calculateOverlapRatio(a, b) {
    const rectA = getCandidateRect(a);
    const rectB = getCandidateRect(b);
    if (!rectA || !rectB) return 0;
    const overlapWidth = Math.max(0,
        Math.min(rectA.x + rectA.width, rectB.x + rectB.width) - Math.max(rectA.x, rectB.x));
    const overlapHeight = Math.max(0,
        Math.min(rectA.y + rectA.height, rectB.y + rectB.height) - Math.max(rectA.y, rectB.y));
    const smallerArea = Math.min(rectA.width * rectA.height, rectB.width * rectB.height);
    return smallerArea > 0 ? (overlapWidth * overlapHeight) / smallerArea : 0;
}

export function candidatesOverlap(a, b, threshold = DEFAULT_OVERLAP_THRESHOLD) {
    return calculateOverlapRatio(a, b) > threshold;
}

export function upsertBestOverlappingCandidate(candidates, candidate, options = {}) {
    const threshold = options.threshold ?? DEFAULT_OVERLAP_THRESHOLD;
    const score = options.score || (entry => entry.confidence ?? 0);
    const index = candidates.findIndex(existing => candidatesOverlap(existing, candidate, threshold));
    if (index === -1) {
        candidates.push(candidate);
        return { inserted: true, replaced: false, index: candidates.length - 1 };
    }
    if (score(candidate) > score(candidates[index])) {
        candidates[index] = candidate;
        return { inserted: false, replaced: true, index };
    }
    return { inserted: false, replaced: false, index };
}

export function suppressOverlappingCandidates(candidates, options = {}) {
    const threshold = options.threshold ?? DEFAULT_OVERLAP_THRESHOLD;
    const score = options.score || (entry => entry.confidence ?? 0);
    const ordered = options.preserveOrder
        ? [...candidates]
        : [...candidates].sort((a, b) => score(b) - score(a));
    const accepted = [];
    for (const candidate of ordered) {
        if (!accepted.some(existing => candidatesOverlap(existing, candidate, threshold))) {
            accepted.push(candidate);
        }
    }
    return accepted;
}

function isAnchorSource(source) {
    return source === 'catalog-probe' || source === 'heuristic-probe';
}

function isDriftedSource(source) {
    return source === 'global-search' || source === 'global-free' ||
        source === 'global-aligned' || source === 'adaptive-search';
}

export function compareDetectionCandidates(a, b) {
    const aIsAnchor = isAnchorSource(a.source);
    const bIsAnchor = isAnchorSource(b.source);
    if (aIsAnchor === bIsAnchor) return b.confidence - a.confidence;

    if (aIsAnchor && isDriftedSource(b.source) &&
        a.confidence >= 0.20 && b.confidence - a.confidence < 0.08) {
        return -1;
    }
    if (bIsAnchor && isDriftedSource(a.source) &&
        b.confidence >= 0.20 && a.confidence - b.confidence < 0.08) {
        return 1;
    }
    return b.confidence - a.confidence;
}
