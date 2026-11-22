import { describe, expect, it } from 'vitest';
import { MockAtlassianClient } from '../src/adapters/mockAtlassianClient';
import { createRovoActionHandlers } from '../src/handlers/rovoActions';

describe('Rovo & Atlassian MCP action handlers', () => {
  it('evaluateShipReadinessAction returns structured JSON for both flat and nested inputs', async () => {
    const handlers = createRovoActionHandlers(new MockAtlassianClient());

    const resNested = await handlers.evaluateShipReadinessAction({
      inputs: { issueKey: 'PAY-412' }
    });
    expect(resNested.ok).toBe(true);
    if (resNested.ok) {
      expect(resNested.verdict).toBe('BLOCK');
      expect(resNested.incidentCollisions.length).toBeGreaterThan(0);
    }

    const resFlat = await handlers.evaluateShipReadinessAction({ issueKey: 'PAY-425' });
    expect(resFlat.ok).toBe(true);
    if (resFlat.ok) {
      expect(resFlat.verdict).toBe('GO');
    }
  });

  it('checkIncidentCollisionsAction detects INC-889 collision for PAY-412 and clears PAY-425', async () => {
    const handlers = createRovoActionHandlers(new MockAtlassianClient());

    const blocked = await handlers.checkIncidentCollisionsAction({ issueKey: 'PAY-412' });
    expect(blocked.ok).toBe(true);
    if (blocked.ok) {
      expect(blocked.safeToDeploy).toBe(false);
      expect(blocked.collisions[0].incidentKey).toBe('INC-889');
    }

    const clear = await handlers.checkIncidentCollisionsAction({ issueKey: 'PAY-425' });
    expect(clear.ok).toBe(true);
    if (clear.ok) {
      expect(clear.safeToDeploy).toBe(true);
      expect(clear.collisions).toHaveLength(0);
    }
  });

  it('auditRunbookFreshnessAction works by pageId and by issueKey', async () => {
    const handlers = createRovoActionHandlers(new MockAtlassianClient());

    const byPage = await handlers.auditRunbookFreshnessAction({
      pageId: 'CONF-101',
      projectKey: 'PAY'
    });
    expect(byPage.ok).toBe(true);
    if (byPage.ok && byPage.mode === 'CONFLUENCE_PAGE') {
      expect(byPage.audit.isStale).toBe(true);
    }

    const byIssue = await handlers.auditRunbookFreshnessAction({ issueKey: 'PAY-425' });
    expect(byIssue.ok).toBe(true);
    if (byIssue.ok && byIssue.mode === 'JIRA_ISSUE_RUNBOOKS') {
      expect(byIssue.runbookCount).toBe(1);
    }
  });

  it('recordShipDecisionAction validates decision enum and persists audit trail', async () => {
    const handlers = createRovoActionHandlers(new MockAtlassianClient());

    const bad = await handlers.recordShipDecisionAction({
      issueKey: 'PAY-412',
      decision: 'YOLO',
      justification: 'Not a valid decision value'
    });
    expect(bad.ok).toBe(false);

    const good = await handlers.recordShipDecisionAction({
      issueKey: 'PAY-412',
      decision: 'OVERRIDDEN',
      justification: 'Approved US-East staged canary after incident commander review.',
      actorName: 'Priya Nair'
    });
    expect(good.ok).toBe(true);
    if (good.ok) {
      expect(good.updatedVerdict).toBe('CAUTION');
    }
  });

  it('getProjectReleaseRiskAction ranks active candidates for PAY', async () => {
    const handlers = createRovoActionHandlers(new MockAtlassianClient());
    const res = await handlers.getProjectReleaseRiskAction({ projectKey: 'PAY' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.kpis.totalCandidates).toBe(6);
      expect(res.highestRiskCandidates[0].verdict).toBe('BLOCK');
    }
  });
});
