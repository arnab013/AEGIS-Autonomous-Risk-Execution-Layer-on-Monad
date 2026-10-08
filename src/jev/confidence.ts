export interface ConfidenceMetrics {
  max_probability: number;
  entropy: number; // Normalized Shannon entropy [0, 1]
  top_two_margin: number; // p1 - p2
  confidence_score: number; // Composite metric [0, 1]
  should_abstain: boolean; // When confidence is too low to act aggressively
}

/**
 * Calculates information-theoretic confidence metrics from a discrete probability distribution.
 */
export function calculateConfidence(probabilities: Record<string, number>): ConfidenceMetrics {
  const values = Object.values(probabilities);
  const sum = values.reduce((total, p) => total + p, 0);
  if (
    values.length === 0 ||
    values.some((p) => typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 1) ||
    Math.abs(sum - 1) > 0.01
  ) {
    return {
      max_probability: 0,
      entropy: 1.0,
      top_two_margin: 0,
      confidence_score: 0,
      should_abstain: true,
    };
  }

  // Sort descending
  const sorted = [...values].sort((a, b) => b - a);
  const p1 = sorted[0] || 0;
  const p2 = sorted[1] || 0;
  const top_two_margin = Math.max(0, p1 - p2);

  // Shannon entropy: H = - sum(p * log2(p))
  const k = values.length;
  let rawEntropy = 0;
  for (const p of values) {
    if (p > 1e-9) {
      rawEntropy -= p * Math.log2(p);
    }
  }

  // Normalize by max entropy: log2(K)
  const maxEntropy = k > 1 ? Math.log2(k) : 1;
  const normalizedEntropy = Math.min(1.0, Math.max(0.0, rawEntropy / maxEntropy));

  // Composite confidence score:
  // High when: p1 is high, entropy is low (1 - H is high), margin is wide
  const confidence_score = Number(
    (p1 * 0.4 + (1 - normalizedEntropy) * 0.35 + top_two_margin * 0.25).toFixed(3)
  );

  // Abstention rule:
  // If entropy is extremely high (> 0.85), or top-2 margin is negligible (< 0.12), or max prob < 0.35
  const should_abstain = normalizedEntropy > 0.85 || top_two_margin < 0.12 || p1 < 0.35;

  return {
    max_probability: Number(p1.toFixed(3)),
    entropy: Number(normalizedEntropy.toFixed(3)),
    top_two_margin: Number(top_two_margin.toFixed(3)),
    confidence_score: Math.max(0, Math.min(1, confidence_score)),
    should_abstain,
  };
}
