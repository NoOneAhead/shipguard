export type ShipVerdict = 'GO' | 'CAUTION' | 'BLOCK';
export type RiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type DimensionKey =
  | 'jiraDependencies'
  | 'runbookReadiness'
  | 'incidentCollisions'
  | 'teamworkGraphContext'
  | 'changeDriftGovernance';

export interface RunbookSectionCheck {
  id: 'rollback' | 'monitoring' | 'healthChecks' | 'escalation' | 'verification';
  label: string;
  present: boolean;
  matchedTerms: string[];
}

export interface RunbookAuditResult {
  pageId: string;
  title: string;
  spaceKey: string;
  url: string;
  score: number;
  status: 'HEALTHY' | 'NEEDS_ATTENTION' | 'STALE_OR_INCOMPLETE';
  ageDays: number;
  freshnessSlaDays: number;
  isStale: boolean;
  updatedAt: string;
  sections: RunbookSectionCheck[];
  missingSections: string[];
  recommendations: string[];
}

export interface ActiveIncidentData {
  key: string;
  summary: string;
  severity: 'SEV-1' | 'SEV-2' | 'SEV-3' | 'SEV-4';
  status: string;
  components: string[];
  labels: string[];
  affectedServices: string[];
  ownerName: string;
  createdAt: string;
  url: string;
}

export interface IncidentCollision {
  incident: ActiveIncidentData;
  matchScore: number;
  matchedOn: string[];
  impactLevel: RiskSeverity;
  explanation: string;
}

export interface TeamworkGraphNode {
  id: string;
  type: 'ISSUE' | 'PAGE' | 'INCIDENT' | 'TEAM' | 'USER' | 'PULL_REQUEST' | 'SERVICE';
  label: string;
  subtitle?: string;
  status?: string;
  risk: RiskSeverity;
  url?: string;
  meta?: Record<string, string | number | boolean>;
}

export interface TeamworkGraphEdge {
  from: string;
  to: string;
  relation: string;
  severity: RiskSeverity;
}

export interface TeamworkGraphContextData {
  source: 'TEAMWORK_GRAPH_API' | 'HYBRID_FALLBACK';
  available: boolean;
  note?: string;
  owningTeams: Array<{ id: string; name: string; memberCount?: number }>;
  connectedContributors: Array<{ id: string; name: string; role: string }>;
  linkedPullRequests: Array<{
    id: string;
    title: string;
    status: 'OPEN' | 'MERGED' | 'CHANGES_REQUESTED' | 'DRAFT';
    reviewersApproved: number;
    url?: string;
  }>;
  crossProductPages: Array<{ id: string; title: string; url: string }>;
  impactedServices: string[];
  hopCount: number;
}

export interface RiskFinding {
  id: string;
  dimension: DimensionKey;
  severity: RiskSeverity;
  title: string;
  detail: string;
  remediation: string;
  actionType?: 'CREATE_RUNBOOK' | 'POST_AUDIT_COMMENT' | 'RECORD_OVERRIDE' | 'VIEW_INCIDENT';
}

export interface DimensionScore {
  key: DimensionKey;
  label: string;
  score: number;
  weight: number;
  weightedContribution: number;
  status: ShipVerdict;
  summary: string;
  findings: RiskFinding[];
}

export interface PolicyConfig {
  projectKey: string;
  goThreshold: number;
  cautionThreshold: number;
  runbookFreshnessSlaDays: number;
  blockOnSev1Collision: boolean;
  blockOnOpenBlocker: boolean;
  requireQaSignOffForHighPriority: boolean;
  weights: Record<DimensionKey, number>;
  updatedAt: string;
  updatedBy?: string;
}

export interface ShipDecisionRecord {
  id: string;
  issueKey: string;
  projectKey: string;
  decision: 'APPROVED' | 'OVERRIDDEN' | 'HELD';
  previousScore: number;
  previousVerdict: ShipVerdict;
  justification: string;
  actorName: string;
  createdAt: string;
}

export interface DriftSnapshot {
  issueKey: string;
  score: number;
  verdict: ShipVerdict;
  blockerCount: number;
  incidentCollisionCount: number;
  recordedAt: string;
  triggerEvent: string;
}

export interface ShipReadinessReport {
  issueKey: string;
  projectKey: string;
  summary: string;
  status: string;
  priority: string;
  assigneeName: string;
  components: string[];
  labels: string[];
  fixVersions: string[];
  score: number;
  verdict: ShipVerdict;
  hardBlockReasons: string[];
  dimensions: DimensionScore[];
  findings: RiskFinding[];
  runbookAudits: RunbookAuditResult[];
  incidentCollisions: IncidentCollision[];
  teamworkGraph: TeamworkGraphContextData;
  blastRadius: {
    nodes: TeamworkGraphNode[];
    edges: TeamworkGraphEdge[];
    blastRadiusTier: 'CONTAINED' | 'MODERATE' | 'WIDE' | 'CRITICAL';
    affectedCount: number;
  };
  latestDecision?: ShipDecisionRecord;
  decisionHistory: ShipDecisionRecord[];
  driftHistory: DriftSnapshot[];
  scoreDeltaSinceLastCheck?: number;
  policyApplied: PolicyConfig;
  evaluatedAt: string;
}

export interface DemoSeedItem {
  kind:
    | 'JIRA_STORY_BLOCKED'
    | 'JIRA_BLOCKER'
    | 'JIRA_INCIDENT'
    | 'JIRA_STORY_READY'
    | 'CONFLUENCE_RUNBOOK';
  keyOrId: string;
  title: string;
  url?: string;
  status: 'CREATED' | 'EXISTING' | 'SKIPPED';
  note?: string;
}

export interface DemoSeedResult {
  projectKey: string;
  alreadySeeded: boolean;
  createdCount: number;
  existingCount: number;
  skippedCount: number;
  warnings: string[];
  items: DemoSeedItem[];
  seededAt: string;
  primaryIssueKey?: string;
}

export interface ProjectReleaseSummary {
  projectKey: string;
  projectName: string;
  evaluatedAt: string;
  policy: PolicyConfig;
  hasDemoScenario?: boolean;
  demoSeedInfo?: DemoSeedResult | null;
  kpis: {
    totalCandidates: number;
    goCount: number;
    cautionCount: number;
    blockCount: number;
    averageScore: number;
    activeSev1Sev2Incidents: number;
    staleRunbooksCount: number;
  };
  activeIncidents: ActiveIncidentData[];
  candidates: Array<{
    issueKey: string;
    summary: string;
    status: string;
    priority: string;
    assigneeName: string;
    components: string[];
    fixVersions: string[];
    score: number;
    verdict: ShipVerdict;
    topBlocker?: string;
    incidentCollisionCount: number;
    runbookStatus: 'HEALTHY' | 'NEEDS_ATTENTION' | 'STALE_OR_INCOMPLETE' | 'MISSING';
    blastRadiusTier: 'CONTAINED' | 'MODERATE' | 'WIDE' | 'CRITICAL';
    hasOverride: boolean;
  }>;
}

export interface ConfluenceAuditResponse {
  audit: RunbookAuditResult;
  relatedIssues: Array<{ issueKey: string; summary: string; status: string }>;
}

export interface PreviewSeedInfo {
  issues: Array<{ key: string; summary: string }>;
  pages: Array<{ id: string; title: string; spaceKey: string }>;
  projectKey: string;
}
