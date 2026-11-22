import { detectIncidentCollisions } from './incidentMatcher';
import { normalizePolicy } from './policyDefaults';
import { analyzeRunbookPage } from './runbookAnalyzer';
import {
  ActiveIncidentData,
  ConfluencePageData,
  DimensionKey,
  DimensionScore,
  DriftSnapshot,
  IncidentCollision,
  JiraIssueData,
  PolicyConfig,
  RiskFinding,
  RiskSeverity,
  RunbookAuditResult,
  ShipDecisionRecord,
  ShipReadinessReport,
  ShipVerdict,
  TeamworkGraphContextData,
  TeamworkGraphEdge,
  TeamworkGraphNode
} from './types';

export interface EvaluateReadinessInput {
  issue: JiraIssueData;
  linkedRunbooks: ConfluencePageData[];
  activeIncidents: ActiveIncidentData[];
  teamworkGraph: TeamworkGraphContextData;
  policy?: Partial<PolicyConfig>;
  decisionHistory?: ShipDecisionRecord[];
  driftHistory?: DriftSnapshot[];
  now?: Date;
}

const HIGH_RISK_LABELS = new Set([
  'db-migration',
  'schema-change',
  'breaking-change',
  'security-sensitive',
  'payments',
  'auth',
  'billing',
  'pci',
  'infrastructure',
  'zero-downtime'
]);

function verdictForScore(score: number, policy: PolicyConfig): ShipVerdict {
  if (score >= policy.goThreshold) return 'GO';
  if (score >= policy.cautionThreshold) return 'CAUTION';
  return 'BLOCK';
}

function isHighPriority(priority: string): boolean {
  const p = priority.toLowerCase();
  return p === 'highest' || p === 'high' || p === 'blocker' || p === 'critical' || p === 'p0' || p === 'p1';
}

function isBlockerLink(linkType: string, direction: 'inward' | 'outward'): boolean {
  const normalized = linkType.toLowerCase();
  return (
    (normalized.includes('block') && direction === 'inward') ||
    normalized.includes('is blocked by') ||
    normalized.includes('depends on')
  );
}

export function evaluateShipReadiness(input: EvaluateReadinessInput): ShipReadinessReport {
  const now = input.now ?? new Date();
  const policy = normalizePolicy(input.issue.projectKey, input.policy);
  const { issue, linkedRunbooks, activeIncidents, teamworkGraph } = input;
  const decisionHistory = [...(input.decisionHistory ?? [])].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
  const driftHistory = [...(input.driftHistory ?? [])].sort((a, b) =>
    b.recordedAt.localeCompare(a.recordedAt)
  );

  const hardBlockReasons: string[] = [];

  // -------------------------------------------------------------------------
  // Dimension 1: Jira Dependencies & Readiness
  // -------------------------------------------------------------------------
  const depFindings: RiskFinding[] = [];
  let depScore = 100;

  const openBlockers = issue.issueLinks.filter(
    (link) => isBlockerLink(link.linkType, link.direction) && link.statusCategory !== 'Done'
  );
  if (openBlockers.length > 0) {
    const penalty = Math.min(60, openBlockers.length * 32);
    depScore -= penalty;
    for (const blocker of openBlockers) {
      depFindings.push({
        id: `blocker-${blocker.key}`,
        dimension: 'jiraDependencies',
        severity: 'CRITICAL',
        title: `Blocked by unresolved issue ${blocker.key}`,
        detail: `${blocker.key} ("${blocker.summary}") is currently "${blocker.status}" (${blocker.priority}).`,
        remediation: `Resolve or explicitly decouple ${blocker.key} before merging or triggering deployment.`
      });
    }
    if (policy.blockOnOpenBlocker) {
      hardBlockReasons.push(
        `${openBlockers.length} unresolved blocker(s): ${openBlockers.map((b) => b.key).join(', ')}`
      );
    }
  }

  const linkedOpenBugs = issue.issueLinks.filter(
    (link) =>
      link.issueType.toLowerCase() === 'bug' &&
      link.statusCategory !== 'Done' &&
      !openBlockers.some((b) => b.key === link.key)
  );
  if (linkedOpenBugs.length > 0) {
    depScore -= Math.min(28, linkedOpenBugs.length * 14);
    depFindings.push({
      id: `linked-bugs-${issue.key}`,
      dimension: 'jiraDependencies',
      severity: 'HIGH',
      title: `${linkedOpenBugs.length} open linked bug(s) attached`,
      detail: `Linked open bugs: ${linkedOpenBugs.map((b) => `${b.key} (${b.status})`).join(', ')}.`,
      remediation: 'Verify linked bugs do not regress this release scope or move them out of this release.'
    });
  }

  const openSubtasks = issue.subtasks.filter((st) => st.statusCategory !== 'Done');
  if (openSubtasks.length > 0) {
    depScore -= Math.min(24, openSubtasks.length * 8);
    depFindings.push({
      id: `open-subtasks-${issue.key}`,
      dimension: 'jiraDependencies',
      severity: openSubtasks.length >= 2 ? 'HIGH' : 'MEDIUM',
      title: `${openSubtasks.length} incomplete subtask(s) remaining`,
      detail: `Remaining subtasks: ${openSubtasks.map((s) => `${s.key} (${s.status})`).join(', ')}.`,
      remediation: 'Complete or defer remaining subtasks before advancing to Ready for Release.'
    });
  }

  if (policy.requireQaSignOffForHighPriority && isHighPriority(issue.priority) && !issue.hasQaSignOff) {
    depScore -= 18;
    depFindings.push({
      id: `qa-signoff-${issue.key}`,
      dimension: 'jiraDependencies',
      severity: 'HIGH',
      title: 'Missing QA verification sign-off on high-priority release item',
      detail: `${issue.key} has priority "${issue.priority}" without a recorded QA sign-off label or checklist approval.`,
      remediation: 'Obtain QA sign-off (label "qa-approved" or QA transition) prior to production deploy.'
    });
  }

  if (!issue.assignee) {
    depScore -= 12;
    depFindings.push({
      id: `unassigned-${issue.key}`,
      dimension: 'jiraDependencies',
      severity: 'MEDIUM',
      title: 'Release candidate has no assigned release owner',
      detail: 'No Jira assignee is set to coordinate rollout or rollback if an anomaly occurs.',
      remediation: 'Assign a release owner in Jira before shipping.'
    });
  }

  depScore = Math.max(0, depScore);

  // -------------------------------------------------------------------------
  // Dimension 2: Confluence Runbook & ADR Freshness
  // -------------------------------------------------------------------------
  const runbookAudits: RunbookAuditResult[] = linkedRunbooks.map((page) =>
    analyzeRunbookPage(page, policy.runbookFreshnessSlaDays, now)
  );
  const runbookFindings: RiskFinding[] = [];
  let runbookScore = 100;

  if (runbookAudits.length === 0) {
    runbookScore = 25;
    runbookFindings.push({
      id: `missing-runbook-${issue.key}`,
      dimension: 'runbookReadiness',
      severity: 'HIGH',
      title: 'No linked Confluence release runbook or ADR found',
      detail: `Neither remote links nor Teamwork Graph connected a deployment/rollback runbook to ${issue.key}.`,
      remediation: 'Link an existing Confluence runbook or generate a structured Rollback Runbook Stub.',
      actionType: 'CREATE_RUNBOOK'
    });
  } else {
    const bestRunbook = [...runbookAudits].sort((a, b) => b.score - a.score)[0];
    runbookScore = bestRunbook.score;

    for (const audit of runbookAudits) {
      if (audit.missingSections.includes('Rollback Procedure')) {
        runbookFindings.push({
          id: `missing-rollback-${audit.pageId}`,
          dimension: 'runbookReadiness',
          severity: 'HIGH',
          title: `Runbook "${audit.title}" lacks a Rollback Procedure`,
          detail: `Audited score ${audit.score}/100. Missing sections: ${audit.missingSections.join(', ')}.`,
          remediation: 'Add explicit rollback steps or generate a compliant rollback runbook stub in Confluence.',
          actionType: 'CREATE_RUNBOOK'
        });
      } else if (audit.missingSections.length > 0) {
        runbookFindings.push({
          id: `incomplete-runbook-${audit.pageId}`,
          dimension: 'runbookReadiness',
          severity: 'MEDIUM',
          title: `Runbook "${audit.title}" is missing ${audit.missingSections.length} operational section(s)`,
          detail: `Missing: ${audit.missingSections.join(', ')}.`,
          remediation: audit.recommendations[0] ?? 'Complete all operational readiness sections.'
        });
      }

      if (audit.isStale) {
        runbookFindings.push({
          id: `stale-runbook-${audit.pageId}`,
          dimension: 'runbookReadiness',
          severity: audit.ageDays > policy.runbookFreshnessSlaDays * 2 ? 'HIGH' : 'MEDIUM',
          title: `Runbook "${audit.title}" is stale (${audit.ageDays} days old)`,
          detail: `Last updated ${audit.ageDays} days ago, exceeding team freshness SLA of ${policy.runbookFreshnessSlaDays} days.`,
          remediation: 'Review and republish the runbook so metrics, dashboards, and rollback commands are current.'
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Dimension 3: Active Incident Collisions (JSM / Jira Incidents)
  // -------------------------------------------------------------------------
  const incidentCollisions: IncidentCollision[] = detectIncidentCollisions(
    issue,
    activeIncidents,
    teamworkGraph
  );
  const incidentFindings: RiskFinding[] = [];
  let incidentScore = 100;

  for (const collision of incidentCollisions) {
    if (collision.impactLevel === 'CRITICAL') {
      incidentScore -= 70;
      if (policy.blockOnSev1Collision) {
        hardBlockReasons.push(
          `Active ${collision.incident.severity} collision (${collision.incident.key}) on ${collision.matchedOn.join(', ')}`
        );
      }
    } else if (collision.impactLevel === 'HIGH') {
      incidentScore -= 42;
    } else if (collision.impactLevel === 'MEDIUM') {
      incidentScore -= 20;
    } else {
      incidentScore -= 10;
    }

    incidentFindings.push({
      id: `incident-${collision.incident.key}`,
      dimension: 'incidentCollisions',
      severity: collision.impactLevel,
      title: `${collision.incident.severity} collision: ${collision.incident.key} (${collision.incident.status})`,
      detail: collision.explanation,
      remediation: `Coordinate with incident owner ${collision.incident.ownerName} and hold non-remediation deploys until stabilized.`,
      actionType: 'VIEW_INCIDENT'
    });
  }
  incidentScore = Math.max(0, incidentScore);

  // -------------------------------------------------------------------------
  // Dimension 4: Teamwork Graph Context & Cross-Product Blast Radius
  // -------------------------------------------------------------------------
  const graphFindings: RiskFinding[] = [];
  let graphScore = 100;

  const prsChangesRequested = teamworkGraph.linkedPullRequests.filter(
    (pr) => pr.status === 'CHANGES_REQUESTED'
  );
  const prsUnapprovedOpen = teamworkGraph.linkedPullRequests.filter(
    (pr) => (pr.status === 'OPEN' || pr.status === 'DRAFT') && pr.reviewersApproved < 1
  );

  if (prsChangesRequested.length > 0) {
    graphScore -= Math.min(45, prsChangesRequested.length * 30);
    graphFindings.push({
      id: `pr-changes-requested-${issue.key}`,
      dimension: 'teamworkGraphContext',
      severity: 'HIGH',
      title: `${prsChangesRequested.length} linked PR(s) have requested changes`,
      detail: `Blocked PRs: ${prsChangesRequested.map((p) => `${p.id} (${p.title})`).join(', ')}.`,
      remediation: 'Resolve reviewer feedback and obtain approval before merging.'
    });
  }

  if (prsUnapprovedOpen.length > 0) {
    graphScore -= Math.min(30, prsUnapprovedOpen.length * 18);
    graphFindings.push({
      id: `pr-unapproved-${issue.key}`,
      dimension: 'teamworkGraphContext',
      severity: 'MEDIUM',
      title: `${prsUnapprovedOpen.length} open PR(s) awaiting peer approval`,
      detail: `Unapproved PRs: ${prsUnapprovedOpen.map((p) => p.id).join(', ')}.`,
      remediation: 'Secure at least one peer code review approval from an owning team member.'
    });
  }

  if (teamworkGraph.impactedServices.length >= 4) {
    graphScore -= 18;
    graphFindings.push({
      id: `wide-service-fanout-${issue.key}`,
      dimension: 'teamworkGraphContext',
      severity: 'MEDIUM',
      title: `Wide cross-service blast radius (${teamworkGraph.impactedServices.length} services)`,
      detail: `Teamwork Graph links this change across: ${teamworkGraph.impactedServices.join(', ')}.`,
      remediation: 'Use progressive canary rollout (5% -> 25% -> 100%) and notify downstream service owners.'
    });
  }

  if (teamworkGraph.owningTeams.length === 0) {
    graphScore -= 12;
    graphFindings.push({
      id: `missing-owning-team-${issue.key}`,
      dimension: 'teamworkGraphContext',
      severity: 'LOW',
      title: 'No owning Atlassian Team identified in Teamwork Graph',
      detail: 'Linking an owning team clarifies escalation routing and cross-team review ownership.',
      remediation: 'Associate the assignee or component with an Atlassian Team.'
    });
  }

  graphScore = Math.max(0, graphScore);

  // -------------------------------------------------------------------------
  // Dimension 5: Change Drift & Governance (KVS History & High-Risk Scope)
  // -------------------------------------------------------------------------
  const govFindings: RiskFinding[] = [];
  let govScore = 100;

  const matchedRiskLabels = issue.labels.filter((l) => HIGH_RISK_LABELS.has(l.toLowerCase()));
  if (matchedRiskLabels.length > 0 && !issue.hasSecurityReview) {
    govScore -= Math.min(34, 16 + matchedRiskLabels.length * 8);
    govFindings.push({
      id: `high-risk-labels-${issue.key}`,
      dimension: 'changeDriftGovernance',
      severity: matchedRiskLabels.some((l) =>
        ['db-migration', 'breaking-change', 'payments', 'auth', 'security-sensitive'].includes(
          l.toLowerCase()
        )
      )
        ? 'HIGH'
        : 'MEDIUM',
      title: `High-risk change tags (${matchedRiskLabels.join(', ')}) lack security/architecture sign-off`,
      detail:
        'Changes touching schema migrations, authentication, payments, or breaking APIs require explicit review.',
      remediation: 'Add label "security-reviewed" or record a justified ShipGuard governance decision.',
      actionType: 'RECORD_OVERRIDE'
    });
  }

  let scoreDeltaSinceLastCheck: number | undefined;
  if (driftHistory.length > 0) {
    const previousSnapshot = driftHistory[0];
    if (previousSnapshot.blockerCount < openBlockers.length) {
      govScore -= 18;
      govFindings.push({
        id: `blocker-drift-${issue.key}`,
        dimension: 'changeDriftGovernance',
        severity: 'MEDIUM',
        title: 'New blocker introduced since last readiness snapshot',
        detail: `Blocker count increased from ${previousSnapshot.blockerCount} to ${openBlockers.length}.`,
        remediation: 'Re-verify release window after triaging newly added blockers.'
      });
    }
    if (previousSnapshot.incidentCollisionCount < incidentCollisions.length) {
      govScore -= 20;
      govFindings.push({
        id: `incident-drift-${issue.key}`,
        dimension: 'changeDriftGovernance',
        severity: 'HIGH',
        title: 'Incident risk escalated since last check',
        detail: `Active incident collisions increased from ${previousSnapshot.incidentCollisionCount} to ${incidentCollisions.length}.`,
        remediation: 'Pause release promotion until active incident collision is cleared.'
      });
    }
  }

  const latestDecision = decisionHistory[0];
  if (latestDecision?.decision === 'HELD') {
    govScore -= 25;
    govFindings.push({
      id: `manual-hold-${latestDecision.id}`,
      dimension: 'changeDriftGovernance',
      severity: 'HIGH',
      title: `Release manually placed ON HOLD by ${latestDecision.actorName}`,
      detail: latestDecision.justification,
      remediation: 'Clear the hold with an updated Approved decision once concerns are resolved.'
    });
    hardBlockReasons.push(`Manual release hold by ${latestDecision.actorName}: ${latestDecision.justification}`);
  }

  govScore = Math.max(0, govScore);

  // -------------------------------------------------------------------------
  // Aggregate Weighted Score & Final Verdict
  // -------------------------------------------------------------------------
  const dimensionSpecs: Array<{
    key: DimensionKey;
    label: string;
    score: number;
    findings: RiskFinding[];
    summary: string;
  }> = [
    {
      key: 'jiraDependencies',
      label: 'Jira Dependencies & Readiness',
      score: depScore,
      findings: depFindings,
      summary:
        openBlockers.length > 0
          ? `${openBlockers.length} open blocker(s), ${openSubtasks.length} open subtask(s)`
          : openSubtasks.length > 0
            ? `No blockers; ${openSubtasks.length} subtask(s) remaining`
            : 'All dependencies and release checklists clear'
    },
    {
      key: 'runbookReadiness',
      label: 'Confluence Runbook & ADR Freshness',
      score: runbookScore,
      findings: runbookFindings,
      summary:
        runbookAudits.length === 0
          ? 'No linked runbook found'
          : `${runbookAudits.length} runbook(s) audited — best score ${Math.max(...runbookAudits.map((r) => r.score))}/100`
    },
    {
      key: 'incidentCollisions',
      label: 'Active Incident Collisions',
      score: incidentScore,
      findings: incidentFindings,
      summary:
        incidentCollisions.length === 0
          ? 'Zero active incident collisions on affected services'
          : `${incidentCollisions.length} active incident collision(s) detected`
    },
    {
      key: 'teamworkGraphContext',
      label: 'Teamwork Graph Context',
      score: graphScore,
      findings: graphFindings,
      summary: `${teamworkGraph.owningTeams.length} team(s), ${teamworkGraph.linkedPullRequests.length} PR(s), ${teamworkGraph.impactedServices.length} service(s)`
    },
    {
      key: 'changeDriftGovernance',
      label: 'Change Drift & Governance',
      score: govScore,
      findings: govFindings,
      summary:
        latestDecision
          ? `Last decision: ${latestDecision.decision} by ${latestDecision.actorName}`
          : matchedRiskLabels.length > 0
            ? `Sensitive scope tags: ${matchedRiskLabels.join(', ')}`
            : 'Clean drift profile and governance posture'
    }
  ];

  const dimensions: DimensionScore[] = dimensionSpecs.map((spec) => {
    const weight = policy.weights[spec.key];
    return {
      key: spec.key,
      label: spec.label,
      score: spec.score,
      weight,
      weightedContribution: Number((spec.score * weight).toFixed(1)),
      status: verdictForScore(spec.score, policy),
      summary: spec.summary,
      findings: spec.findings
    };
  });

  const rawWeightedScore = dimensions.reduce((sum, d) => sum + d.score * d.weight, 0);
  const score = Math.max(0, Math.min(100, Math.round(rawWeightedScore)));

  if (driftHistory.length > 0) {
    scoreDeltaSinceLastCheck = score - driftHistory[0].score;
  }

  let verdict: ShipVerdict = verdictForScore(score, policy);
  const hasHighIncidentCollision = incidentCollisions.some(
    (c) => c.impactLevel === 'HIGH' || c.impactLevel === 'CRITICAL'
  );
  const missingRequiredQa =
    policy.requireQaSignOffForHighPriority && isHighPriority(issue.priority) && !issue.hasQaSignOff;

  if (verdict === 'GO' && (hasHighIncidentCollision || missingRequiredQa)) {
    verdict = 'CAUTION';
  }
  if (hardBlockReasons.length > 0) {
    verdict = 'BLOCK';
  }
  // Explicit governance override downgrades BLOCK to CAUTION (audit-logged, never silently green!)
  if (latestDecision?.decision === 'OVERRIDDEN' && verdict === 'BLOCK') {
    verdict = 'CAUTION';
  }

  const allFindings = dimensions
    .flatMap((d) => d.findings)
    .sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity));

  const blastRadius = buildBlastRadiusGraph({
    issue,
    verdict,
    openBlockers,
    runbookAudits,
    incidentCollisions,
    teamworkGraph
  });

  return {
    issueKey: issue.key,
    projectKey: issue.projectKey,
    summary: issue.summary,
    status: issue.status,
    priority: issue.priority,
    assigneeName: issue.assignee?.displayName ?? 'Unassigned',
    components: issue.components,
    labels: issue.labels,
    fixVersions: issue.fixVersions,
    score,
    verdict,
    hardBlockReasons,
    dimensions,
    findings: allFindings,
    runbookAudits,
    incidentCollisions,
    teamworkGraph,
    blastRadius,
    latestDecision,
    decisionHistory,
    driftHistory,
    scoreDeltaSinceLastCheck,
    policyApplied: policy,
    evaluatedAt: now.toISOString()
  };
}

function severityWeight(sev: RiskSeverity): number {
  switch (sev) {
    case 'CRITICAL':
      return 4;
    case 'HIGH':
      return 3;
    case 'MEDIUM':
      return 2;
    case 'LOW':
      return 1;
  }
}

function buildBlastRadiusGraph(params: {
  issue: JiraIssueData;
  verdict: ShipVerdict;
  openBlockers: JiraIssueData['issueLinks'];
  runbookAudits: RunbookAuditResult[];
  incidentCollisions: IncidentCollision[];
  teamworkGraph: TeamworkGraphContextData;
}): ShipReadinessReport['blastRadius'] {
  const nodes: TeamworkGraphNode[] = [];
  const edges: TeamworkGraphEdge[] = [];
  const seenNodeIds = new Set<string>();

  const addNode = (node: TeamworkGraphNode) => {
    if (!seenNodeIds.has(node.id)) {
      seenNodeIds.add(node.id);
      nodes.push(node);
    }
  };

  const rootId = `issue:${params.issue.key}`;
  addNode({
    id: rootId,
    type: 'ISSUE',
    label: params.issue.key,
    subtitle: params.issue.summary,
    status: params.issue.status,
    risk: params.verdict === 'BLOCK' ? 'CRITICAL' : params.verdict === 'CAUTION' ? 'HIGH' : 'LOW',
    meta: {
      priority: params.issue.priority,
      assignee: params.issue.assignee?.displayName ?? 'Unassigned'
    }
  });

  for (const link of params.issue.issueLinks.slice(0, 6)) {
    const isBlocker = params.openBlockers.some((b) => b.key === link.key);
    const id = `issue:${link.key}`;
    addNode({
      id,
      type: 'ISSUE',
      label: link.key,
      subtitle: link.summary,
      status: link.status,
      risk: isBlocker ? 'CRITICAL' : link.statusCategory === 'Done' ? 'LOW' : 'MEDIUM'
    });
    edges.push({
      from: isBlocker ? id : rootId,
      to: isBlocker ? rootId : id,
      relation: link.linkType,
      severity: isBlocker ? 'CRITICAL' : 'LOW'
    });
  }

  for (const audit of params.runbookAudits.slice(0, 4)) {
    const id = `page:${audit.pageId}`;
    const risk: RiskSeverity =
      audit.status === 'STALE_OR_INCOMPLETE'
        ? 'HIGH'
        : audit.status === 'NEEDS_ATTENTION'
          ? 'MEDIUM'
          : 'LOW';
    addNode({
      id,
      type: 'PAGE',
      label: audit.title,
      subtitle: `Runbook ${audit.score}/100 · ${audit.ageDays}d old`,
      status: audit.status,
      risk,
      url: audit.url
    });
    edges.push({
      from: rootId,
      to: id,
      relation: 'documented by',
      severity: risk
    });
  }

  for (const collision of params.incidentCollisions.slice(0, 4)) {
    const id = `incident:${collision.incident.key}`;
    addNode({
      id,
      type: 'INCIDENT',
      label: `${collision.incident.key} (${collision.incident.severity})`,
      subtitle: collision.incident.summary,
      status: collision.incident.status,
      risk: collision.impactLevel,
      url: collision.incident.url
    });
    edges.push({
      from: id,
      to: rootId,
      relation: `collides (${collision.matchedOn[0] ?? 'service'})`,
      severity: collision.impactLevel
    });
  }

  for (const team of params.teamworkGraph.owningTeams.slice(0, 3)) {
    const id = `team:${team.id}`;
    addNode({
      id,
      type: 'TEAM',
      label: team.name,
      subtitle: team.memberCount ? `${team.memberCount} engineers` : 'Atlassian Team',
      risk: 'LOW'
    });
    edges.push({
      from: id,
      to: rootId,
      relation: 'owns',
      severity: 'LOW'
    });
  }

  for (const pr of params.teamworkGraph.linkedPullRequests.slice(0, 3)) {
    const id = `pr:${pr.id}`;
    const risk: RiskSeverity =
      pr.status === 'CHANGES_REQUESTED'
        ? 'HIGH'
        : pr.status === 'OPEN' && pr.reviewersApproved < 1
          ? 'MEDIUM'
          : 'LOW';
    addNode({
      id,
      type: 'PULL_REQUEST',
      label: pr.id,
      subtitle: pr.title,
      status: pr.status,
      risk,
      url: pr.url
    });
    edges.push({
      from: id,
      to: rootId,
      relation: 'implements',
      severity: risk
    });
  }

  for (const service of params.teamworkGraph.impactedServices.slice(0, 5)) {
    const id = `service:${service}`;
    const hasSev1Collision = params.incidentCollisions.some(
      (c) =>
        c.incident.severity === 'SEV-1' &&
        (c.incident.affectedServices.some((s) => s.toLowerCase() === service.toLowerCase()) ||
          c.incident.components.some((s) => s.toLowerCase() === service.toLowerCase()))
    );
    addNode({
      id,
      type: 'SERVICE',
      label: service,
      subtitle: hasSev1Collision ? 'Active SEV-1 impacted service' : 'Production service',
      risk: hasSev1Collision ? 'CRITICAL' : 'LOW'
    });
    edges.push({
      from: rootId,
      to: id,
      relation: 'deploys to',
      severity: hasSev1Collision ? 'CRITICAL' : 'LOW'
    });
  }

  const affectedCount = Math.max(0, nodes.length - 1);
  let blastRadiusTier: ShipReadinessReport['blastRadius']['blastRadiusTier'] = 'CONTAINED';
  if (
    params.incidentCollisions.some((c) => c.impactLevel === 'CRITICAL') ||
    (affectedCount >= 10 && params.verdict === 'BLOCK')
  ) {
    blastRadiusTier = 'CRITICAL';
  } else if (affectedCount >= 7 || params.teamworkGraph.impactedServices.length >= 4) {
    blastRadiusTier = 'WIDE';
  } else if (
    affectedCount >= 5 ||
    params.teamworkGraph.impactedServices.length >= 2 ||
    params.incidentCollisions.length > 0
  ) {
    blastRadiusTier = 'MODERATE';
  }

  return {
    nodes,
    edges,
    blastRadiusTier,
    affectedCount
  };
}
