import { PolicyConfig } from './types';

export const DEFAULT_POLICY_WEIGHTS = {
  jiraDependencies: 0.25,
  runbookReadiness: 0.22,
  incidentCollisions: 0.23,
  teamworkGraphContext: 0.15,
  changeDriftGovernance: 0.15
} as const;

export function createDefaultPolicy(projectKey: string): PolicyConfig {
  return {
    projectKey,
    goThreshold: 80,
    cautionThreshold: 55,
    runbookFreshnessSlaDays: 45,
    blockOnSev1Collision: true,
    blockOnOpenBlocker: true,
    requireQaSignOffForHighPriority: true,
    weights: { ...DEFAULT_POLICY_WEIGHTS },
    updatedAt: new Date().toISOString(),
    updatedBy: 'ShipGuard Default Policy'
  };
}

export function normalizePolicy(projectKey: string, partial?: Partial<PolicyConfig>): PolicyConfig {
  const base = createDefaultPolicy(projectKey);
  if (!partial) return base;

  const goThreshold = clampInt(partial.goThreshold ?? base.goThreshold, 50, 98);
  const cautionThreshold = clampInt(
    partial.cautionThreshold ?? base.cautionThreshold,
    20,
    Math.min(goThreshold - 5, 90)
  );
  const runbookFreshnessSlaDays = clampInt(
    partial.runbookFreshnessSlaDays ?? base.runbookFreshnessSlaDays,
    7,
    365
  );

  const rawWeights = { ...base.weights, ...(partial.weights ?? {}) };
  const weightSum =
    rawWeights.jiraDependencies +
    rawWeights.runbookReadiness +
    rawWeights.incidentCollisions +
    rawWeights.teamworkGraphContext +
    rawWeights.changeDriftGovernance;

  const normalizedWeights =
    weightSum > 0
      ? {
          jiraDependencies: Number((rawWeights.jiraDependencies / weightSum).toFixed(4)),
          runbookReadiness: Number((rawWeights.runbookReadiness / weightSum).toFixed(4)),
          incidentCollisions: Number((rawWeights.incidentCollisions / weightSum).toFixed(4)),
          teamworkGraphContext: Number((rawWeights.teamworkGraphContext / weightSum).toFixed(4)),
          changeDriftGovernance: Number((rawWeights.changeDriftGovernance / weightSum).toFixed(4))
        }
      : { ...base.weights };

  return {
    projectKey,
    goThreshold,
    cautionThreshold,
    runbookFreshnessSlaDays,
    blockOnSev1Collision: partial.blockOnSev1Collision ?? base.blockOnSev1Collision,
    blockOnOpenBlocker: partial.blockOnOpenBlocker ?? base.blockOnOpenBlocker,
    requireQaSignOffForHighPriority:
      partial.requireQaSignOffForHighPriority ?? base.requireQaSignOffForHighPriority,
    weights: normalizedWeights,
    updatedAt: partial.updatedAt ?? new Date().toISOString(),
    updatedBy: partial.updatedBy ?? base.updatedBy
  };
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}
