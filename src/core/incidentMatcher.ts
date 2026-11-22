import {
  ActiveIncidentData,
  IncidentCollision,
  JiraIssueData,
  RiskSeverity,
  TeamworkGraphContextData
} from './types';

const NON_COLLISION_META_LABELS = new Set([
  'shipguard-demo',
  'demo',
  'incident',
  'sev-1',
  'sev1',
  'sev-2',
  'sev2',
  'sev-3',
  'sev3',
  'sev-4',
  'sev4',
  'p0',
  'p1',
  'p2',
  'qa-approved',
  'qa-verified',
  'qa-passed',
  'security-reviewed',
  'release',
  'hotfix'
]);

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractTechnicalKeywords(text: string): Set<string> {
  const stopWords = new Set([
    'the',
    'and',
    'for',
    'with',
    'from',
    'that',
    'this',
    'into',
    'when',
    'after',
    'before',
    'update',
    'fix',
    'add',
    'issue',
    'task',
    'story',
    'release',
    'deploy',
    'production',
    'service',
    'system',
    'shipguard',
    'demo'
  ]);

  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 4 && !stopWords.has(t));

  return new Set(tokens);
}

export function detectIncidentCollisions(
  issue: JiraIssueData,
  incidents: ActiveIncidentData[],
  teamworkGraph?: TeamworkGraphContextData
): IncidentCollision[] {
  const issueComponents = new Set(issue.components.map(normalizeToken).filter(Boolean));
  const issueLabels = new Set(issue.labels.map(normalizeToken).filter(Boolean));
  const graphServices = new Set(
    (teamworkGraph?.impactedServices ?? []).map(normalizeToken).filter(Boolean)
  );
  const issueKeywords = extractTechnicalKeywords(`${issue.summary} ${issue.description}`);

  const collisions: IncidentCollision[] = [];

  for (const incident of incidents) {
    // Only collide with active / unresolved incidents
    const normalizedStatus = incident.status.toLowerCase();
    if (
      normalizedStatus.includes('resolved') ||
      normalizedStatus.includes('closed') ||
      normalizedStatus.includes('done')
    ) {
      continue;
    }

    const matchedOn: string[] = [];
    let matchScore = 0;

    for (const comp of incident.components) {
      const norm = normalizeToken(comp);
      if (norm && (issueComponents.has(norm) || graphServices.has(norm))) {
        matchedOn.push(`component:${comp}`);
        matchScore += 45;
      }
    }

    for (const svc of incident.affectedServices) {
      const norm = normalizeToken(svc);
      if (norm && (issueComponents.has(norm) || graphServices.has(norm) || issueLabels.has(norm))) {
        matchedOn.push(`service:${svc}`);
        matchScore += 40;
      }
    }

    for (const label of incident.labels) {
      const norm = normalizeToken(label);
      if (norm && !NON_COLLISION_META_LABELS.has(norm) && issueLabels.has(norm)) {
        matchedOn.push(`label:${label}`);
        matchScore += 25;
      }
    }

    const incKeywords = extractTechnicalKeywords(incident.summary);
    const sharedKeywords: string[] = [];
    for (const kw of incKeywords) {
      if (issueKeywords.has(kw)) {
        sharedKeywords.push(kw);
      }
    }
    if (sharedKeywords.length >= 2) {
      matchedOn.push(`context:${sharedKeywords.slice(0, 3).join(',')}`);
      matchScore += Math.min(25, sharedKeywords.length * 10);
    }

    if (matchedOn.length === 0) {
      continue;
    }

    const clampedScore = Math.min(100, matchScore);
    const isDirectOverlap = matchedOn.some(
      (m) => m.startsWith('component:') || m.startsWith('service:')
    );

    let impactLevel: RiskSeverity = 'MEDIUM';
    if (incident.severity === 'SEV-1' && (isDirectOverlap || clampedScore >= 40)) {
      impactLevel = 'CRITICAL';
    } else if (
      incident.severity === 'SEV-1' ||
      (incident.severity === 'SEV-2' && isDirectOverlap)
    ) {
      impactLevel = 'HIGH';
    } else if (incident.severity === 'SEV-2' || incident.severity === 'SEV-3') {
      impactLevel = 'MEDIUM';
    } else {
      impactLevel = 'LOW';
    }

    const uniqueMatches = Array.from(new Set(matchedOn));
    collisions.push({
      incident,
      matchScore: clampedScore,
      matchedOn: uniqueMatches,
      impactLevel,
      explanation: `Active ${incident.severity} incident ${incident.key} ("${incident.summary}") overlaps on ${uniqueMatches.join(', ')}.`
    });
  }

  // Sort most severe and highest-confidence collisions first
  const severityRank: Record<RiskSeverity, number> = {
    CRITICAL: 4,
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1
  };

  return collisions.sort((a, b) => {
    const sevDiff = severityRank[b.impactLevel] - severityRank[a.impactLevel];
    if (sevDiff !== 0) return sevDiff;
    return b.matchScore - a.matchScore;
  });
}
