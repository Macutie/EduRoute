const COMMON_STOP_WORDS = new Set(['of', 'the', 'at', 'and']);

const toTitleCase = (value = '') =>
    value
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part[0].toUpperCase() + part.slice(1))
        .join(' ');

const normalizeDestination = (value = '') =>
    value
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const tokenizeDestination = (value = '') =>
    normalizeDestination(value)
        .split(' ')
        .filter((token) => token && !COMMON_STOP_WORDS.has(token));

const getDestinationSimilarity = (left, right) => {
    const leftTokens = new Set(tokenizeDestination(left));
    const rightTokens = new Set(tokenizeDestination(right));

    if (!leftTokens.size || !rightTokens.size) {
        return 0;
    }

    let intersection = 0;
    leftTokens.forEach((token) => {
        if (rightTokens.has(token)) {
            intersection += 1;
        }
    });

    const union = new Set([...leftTokens, ...rightTokens]).size;
    const jaccard = union ? intersection / union : 0;
    const leftNormalized = normalizeDestination(left);
    const rightNormalized = normalizeDestination(right);
    const containmentBoost = leftNormalized.includes(rightNormalized) || rightNormalized.includes(leftNormalized)
        ? 0.18
        : 0;

    return Math.min(1, jaccard + containmentBoost);
};

const chooseDisplayLabel = (variants = []) => {
    if (!variants.length) return 'Unknown destination';

    const sorted = [...variants].sort((first, second) => {
        if (second.count !== first.count) {
            return second.count - first.count;
        }

        return first.label.length - second.label.length;
    });

    return toTitleCase(sorted[0].label);
};

const groupFrequentDestinations = (rows = [], { similarityThreshold = 0.7, limit = 5 } = {}) => {
    const clusters = [];

    rows.forEach((row) => {
        const candidate = {
            label: String(row.destination || '').trim(),
            count: Number(row.count || 0),
            normalized: normalizeDestination(row.destination || '')
        };

        if (!candidate.normalized) return;

        let bestCluster = null;
        let bestScore = 0;

        clusters.forEach((cluster) => {
            const score = Math.max(
                getDestinationSimilarity(candidate.label, cluster.displayLabel),
                ...cluster.variants.map((variant) => getDestinationSimilarity(candidate.label, variant.label))
            );

            if (score > bestScore) {
                bestScore = score;
                bestCluster = cluster;
            }
        });

        if (!bestCluster || bestScore < similarityThreshold) {
            clusters.push({
                displayLabel: toTitleCase(candidate.label),
                totalCount: candidate.count,
                variants: [{ label: candidate.label, count: candidate.count }]
            });
            return;
        }

        bestCluster.totalCount += candidate.count;
        const existingVariant = bestCluster.variants.find(
            (variant) => normalizeDestination(variant.label) === candidate.normalized
        );

        if (existingVariant) {
            existingVariant.count += candidate.count;
        } else {
            bestCluster.variants.push({ label: candidate.label, count: candidate.count });
        }

        bestCluster.displayLabel = chooseDisplayLabel(bestCluster.variants);
    });

    return clusters
        .sort((first, second) => second.totalCount - first.totalCount)
        .slice(0, limit)
        .map((cluster, index) => ({
            rank: index + 1,
            label: cluster.displayLabel,
            count: cluster.totalCount,
            variants: cluster.variants
                .sort((first, second) => second.count - first.count)
                .map((variant) => variant.label)
        }));
};

module.exports = {
    normalizeDestination,
    getDestinationSimilarity,
    groupFrequentDestinations
};
