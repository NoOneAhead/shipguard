import { describe, expect, it } from 'vitest';
import { MockAtlassianClient } from '../src/adapters/mockAtlassianClient';
import { ShipGuardService } from '../src/services/shipGuardService';

describe('ShipGuardService integration', () => {
  it('evaluates PAY-412 as BLOCK with active SEV-1 collision, blocker, and stale runbook', async () => {
    const client = new MockAtlassianClient();
    const service = new ShipGuardService(client);

    const report = await service.evaluateIssue('PAY-412');
    expect(report.verdict).toBe('BLOCK');
    expect(report.score).toBeLessThan(55);
    expect(report.incidentCollisions.some((c) => c.incident.key === 'INC-889')).toBe(true);
    expect(report.runbookAudits[0].status).toBe('STALE_OR_INCOMPLETE');
    expect(report.blastRadius.nodes.length).toBeGreaterThanOrEqual(7);
  });

  it('evaluates PAY-425 as GO with score >= 90', async () => {
    const client = new MockAtlassianClient();
    const service = new ShipGuardService(client);

    const report = await service.evaluateIssue('PAY-425');
    expect(report.verdict).toBe('GO');
    expect(report.score).toBeGreaterThanOrEqual(90);
    expect(report.hardBlockReasons).toHaveLength(0);
  });

  it('creates a Rollback Runbook Stub in Confluence, links it, and raises runbook score to 100', async () => {
    const client = new MockAtlassianClient();
    const service = new ShipGuardService(client);

    const before = await service.evaluateIssue('PAY-428');
    expect(before.runbookAudits).toHaveLength(0);
    const beforeRunbookDim = before.dimensions.find((d) => d.key === 'runbookReadiness')!;
    expect(beforeRunbookDim.score).toBe(25);

    const created = await service.createRollbackRunbookStub('PAY-428');
    expect(created.page.title).toContain('PAY-428');
    expect(created.report.runbookAudits).toHaveLength(1);
    const afterRunbookDim = created.report.dimensions.find((d) => d.key === 'runbookReadiness')!;
    expect(afterRunbookDim.score).toBe(100);
    expect(created.report.score).toBeGreaterThan(before.score);
  });

  it('posts a structured readiness audit comment to Jira', async () => {
    const client = new MockAtlassianClient();
    const service = new ShipGuardService(client);

    const res = await service.postReadinessAuditComment('PAY-412');
    expect(res.commentId).toBeTruthy();
    const comments = client.getIssueComments('PAY-412');
    expect(comments).toHaveLength(1);
    expect(comments[0].body).toContain('[ShipGuard Release Readiness Audit] PAY-412');
    expect(comments[0].body).toContain('Verdict: BLOCK');
  });

  it('records an OVERRIDDEN governance decision in KVS and downgrades PAY-412 from BLOCK to CAUTION', async () => {
    const client = new MockAtlassianClient();
    const service = new ShipGuardService(client);

    const { record, report } = await service.recordDecision({
      issueKey: 'PAY-412',
      decision: 'OVERRIDDEN',
      justification: 'Scoped strictly to US-West canary behind kill-switch; EU frozen until INC-889 closes.',
      actorName: 'Alex Rivera'
    });

    expect(record.decision).toBe('OVERRIDDEN');
    expect(report.verdict).toBe('CAUTION');
    expect(report.decisionHistory).toHaveLength(1);
    expect(client.getIssueComments('PAY-412')[0].body).toContain('OVERRIDDEN');
  });

  it('computes ranked project release summary and persists custom policy updates', async () => {
    const client = new MockAtlassianClient();
    const service = new ShipGuardService(client);

    const summary = await service.getProjectReleaseSummary('PAY');
    expect(summary.kpis.totalCandidates).toBe(6);
    expect(summary.kpis.blockCount).toBeGreaterThanOrEqual(2);
    expect(summary.kpis.goCount).toBeGreaterThanOrEqual(2);
    // Blocked items ranked first
    expect(summary.candidates[0].verdict).toBe('BLOCK');

    const updated = await service.updateProjectPolicy('PAY', {
      goThreshold: 95,
      runbookFreshnessSlaDays: 14
    });
    expect(updated.goThreshold).toBe(95);
    expect(updated.runbookFreshnessSlaDays).toBe(14);

    const summaryAfter = await service.getProjectReleaseSummary('PAY');
    expect(summaryAfter.policy.goThreshold).toBe(95);
  });

  it('audits Confluence pages and resolves linked Jira release candidates', async () => {
    const client = new MockAtlassianClient();
    const service = new ShipGuardService(client);

    const stale = await service.auditConfluencePage('CONF-101', 'PAY');
    expect(stale.audit.status).toBe('STALE_OR_INCOMPLETE');
    expect(stale.relatedIssues.some((i) => i.issueKey === 'PAY-412')).toBe(true);

    const healthy = await service.auditConfluencePage('CONF-103', 'PAY');
    expect(healthy.audit.status).toBe('HEALTHY');
    expect(healthy.audit.score).toBe(100);
  });
});
