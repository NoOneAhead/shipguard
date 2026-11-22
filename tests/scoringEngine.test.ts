import { describe, expect, it } from 'vitest';
import { evaluateShipReadiness } from '../src/core/scoringEngine';
import {
  ActiveIncidentData,
  ConfluencePageData,
  JiraIssueData,
  TeamworkGraphContextData
} from '../src/core/types';

function makeHealthyIssue(): JiraIssueData {
  return {
    id: '101',
    key: 'PAY-500',
    projectKey: 'PAY',
    summary: 'Add safe telemetry counter for invoices',
    description: 'Adds Prometheus metric without changing checkout behavior.',
    status: 'Ready for Release',
    statusCategory: 'In Progress',
    issueType: 'Story',
    priority: 'Medium',
    assignee: { accountId: 'u-1', displayName: 'Elena Rostova' },
    labels: ['telemetry', 'qa-approved'],
    components: ['invoicing-api'],
    fixVersions: ['v2026.12.1'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    issueLinks: [],
    remoteLinks: [],
    subtasks: [],
    commentsCount: 2,
    hasQaSignOff: true,
    hasSecurityReview: true
  };
}

function makeHealthyRunbook(): ConfluencePageData {
  return {
    id: 'CONF-500',
    title: 'Invoicing API Production Runbook',
    spaceKey: 'PAYENG',
    url: 'https://demo.atlassian.net/wiki/spaces/PAYENG/pages/500',
    versionNumber: 4,
    updatedAt: new Date(Date.now() - 3 * 86400_000).toISOString(),
    bodyText: `
      <h2>Rollback Procedure</h2><p>Disable flag and revert container image.</p>
      <h2>Monitoring & Alerts</h2><p>Watch Datadog error rate and P95 latency SLO alerts.</p>
      <h2>Health Checks</h2><p>Check /healthz endpoint and canary smoke test.</p>
      <h2>Escalation</h2><p>On-call owner PagerDuty Billing-L1 #ops-billing.</p>
      <h2>Post-Deploy Verification</h2><p>Run validation steps on production metrics.</p>
    `,
    labels: ['runbook']
  };
}

function makeHealthyGraph(): TeamworkGraphContextData {
  return {
    source: 'TEAMWORK_GRAPH_API',
    available: true,
    owningTeams: [{ id: 'team-1', name: 'Billing Core', memberCount: 6 }],
    connectedContributors: [{ id: 'u-1', name: 'Elena Rostova', role: 'Assignee' }],
    linkedPullRequests: [
      { id: 'PR-101', title: 'feat: telemetry counter', status: 'MERGED', reviewersApproved: 2 }
    ],
    crossProductPages: [{ id: 'CONF-500', title: 'Invoicing API Production Runbook', url: '/wiki/500' }],
    impactedServices: ['invoicing-api'],
    hopCount: 2
  };
}

describe('scoringEngine', () => {
  it('returns GO with score 100 when all 5 dimensions are clean', () => {
    const report = evaluateShipReadiness({
      issue: makeHealthyIssue(),
      linkedRunbooks: [makeHealthyRunbook()],
      activeIncidents: [],
      teamworkGraph: makeHealthyGraph()
    });

    expect(report.score).toBe(100);
    expect(report.verdict).toBe('GO');
    expect(report.hardBlockReasons).toHaveLength(0);
    expect(report.dimensions).toHaveLength(5);
    expect(report.blastRadius.blastRadiusTier).toBe('CONTAINED');
  });

  it('triggers BLOCK hard gate on active SEV-1 incident collision even if other dimensions are healthy', () => {
    const sev1: ActiveIncidentData = {
      key: 'INC-999',
      summary: 'SEV-1 Invoicing API outage',
      severity: 'SEV-1',
      status: 'Investigating',
      components: ['invoicing-api'],
      labels: ['sev-1'],
      affectedServices: ['invoicing-api'],
      ownerName: 'Incident Commander',
      createdAt: new Date().toISOString(),
      url: '/browse/INC-999'
    };

    const report = evaluateShipReadiness({
      issue: makeHealthyIssue(),
      linkedRunbooks: [makeHealthyRunbook()],
      activeIncidents: [sev1],
      teamworkGraph: makeHealthyGraph()
    });

    expect(report.verdict).toBe('BLOCK');
    expect(report.hardBlockReasons.length).toBeGreaterThan(0);
    expect(report.blastRadius.blastRadiusTier).toBe('CRITICAL');
    expect(report.incidentCollisions).toHaveLength(1);
  });

  it('downgrades BLOCK to CAUTION (not GO) when an explicit OVERRIDDEN decision is recorded', () => {
    const blockedIssue = makeHealthyIssue();
    blockedIssue.issueLinks = [
      {
        key: 'PAY-499',
        summary: 'Upstream schema prep',
        status: 'In Progress',
        statusCategory: 'In Progress',
        issueType: 'Task',
        priority: 'High',
        linkType: 'is blocked by',
        direction: 'inward'
      }
    ];

    const report = evaluateShipReadiness({
      issue: blockedIssue,
      linkedRunbooks: [makeHealthyRunbook()],
      activeIncidents: [],
      teamworkGraph: makeHealthyGraph(),
      decisionHistory: [
        {
          id: 'dec-1',
          issueKey: 'PAY-500',
          projectKey: 'PAY',
          decision: 'OVERRIDDEN',
          previousScore: 84,
          previousVerdict: 'BLOCK',
          justification: 'Feature flag hides code path until PAY-499 lands.',
          actorName: 'Release Lead',
          createdAt: new Date().toISOString()
        }
      ]
    });

    expect(report.hardBlockReasons.length).toBeGreaterThan(0);
    expect(report.verdict).toBe('CAUTION');
    expect(report.latestDecision?.decision).toBe('OVERRIDDEN');
  });

  it('forces BLOCK when a manual HELD decision is active', () => {
    const report = evaluateShipReadiness({
      issue: makeHealthyIssue(),
      linkedRunbooks: [makeHealthyRunbook()],
      activeIncidents: [],
      teamworkGraph: makeHealthyGraph(),
      decisionHistory: [
        {
          id: 'dec-hold',
          issueKey: 'PAY-500',
          projectKey: 'PAY',
          decision: 'HELD',
          previousScore: 100,
          previousVerdict: 'GO',
          justification: 'Holding until finance quarter close completes.',
          actorName: 'VP Eng',
          createdAt: new Date().toISOString()
        }
      ]
    });

    expect(report.verdict).toBe('BLOCK');
    expect(report.hardBlockReasons.some((r) => r.includes('Manual release hold'))).toBe(true);
  });

  it('detects drift regressions when blocker count increases since last snapshot', () => {
    const issue = makeHealthyIssue();
    issue.issueLinks = [
      {
        key: 'PAY-498',
        summary: 'New blocker',
        status: 'Open',
        statusCategory: 'To Do',
        issueType: 'Bug',
        priority: 'Highest',
        linkType: 'is blocked by',
        direction: 'inward'
      }
    ];
    const report = evaluateShipReadiness({
      issue,
      linkedRunbooks: [makeHealthyRunbook()],
      activeIncidents: [],
      teamworkGraph: makeHealthyGraph(),
      driftHistory: [
        {
          issueKey: 'PAY-500',
          score: 98,
          verdict: 'GO',
          blockerCount: 0,
          incidentCollisionCount: 0,
          recordedAt: new Date(Date.now() - 3600_000).toISOString(),
          triggerEvent: 'avi:jira:updated:issue'
        }
      ]
    });

    expect(report.scoreDeltaSinceLastCheck).toBeLessThan(0);
    expect(report.findings.some((f) => f.id.startsWith('blocker-drift-'))).toBe(true);
  });

  it('caps GO to CAUTION when an active SEV-2 collision or missing high-priority QA sign-off is present', () => {
    const sev2: ActiveIncidentData = {
      key: 'INC-894',
      summary: 'SEV-2 invoicing latency spike',
      severity: 'SEV-2',
      status: 'Mitigating',
      components: ['invoicing-api'],
      labels: ['sev-2'],
      affectedServices: ['invoicing-api'],
      ownerName: 'SRE',
      createdAt: new Date().toISOString(),
      url: '/browse/INC-894'
    };

    const withSev2 = evaluateShipReadiness({
      issue: makeHealthyIssue(),
      linkedRunbooks: [makeHealthyRunbook()],
      activeIncidents: [sev2],
      teamworkGraph: makeHealthyGraph()
    });
    expect(withSev2.verdict).toBe('CAUTION');

    const highNoQa = makeHealthyIssue();
    highNoQa.priority = 'High';
    highNoQa.hasQaSignOff = false;
    const withMissingQa = evaluateShipReadiness({
      issue: highNoQa,
      linkedRunbooks: [makeHealthyRunbook()],
      activeIncidents: [],
      teamworkGraph: makeHealthyGraph()
    });
    expect(withMissingQa.verdict).toBe('CAUTION');
  });
});
