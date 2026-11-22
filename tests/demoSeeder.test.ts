import { describe, expect, it } from 'vitest';
import { MockAtlassianClient } from '../src/adapters/mockAtlassianClient';
import { createResolverHandlers } from '../src/handlers/resolver';
import { ShipGuardService } from '../src/services/shipGuardService';

describe('One-Click Live Demo Scenario Seeder (seedDemoScenario)', () => {
  it('returns empty summary before seeding, then creates complete BLOCK + GO scenario on a fresh site', async () => {
    const client = new MockAtlassianClient({
      startEmpty: true,
      projectKey: 'DEMO',
      projectName: 'Fresh Judge Test Project'
    });
    const service = new ShipGuardService(client);

    // Empty fresh site check
    const emptySummary = await service.getProjectReleaseSummary('DEMO');
    expect(emptySummary.candidates).toHaveLength(0);
    expect(emptySummary.hasDemoScenario).toBe(false);
    expect(emptySummary.kpis.totalCandidates).toBe(0);

    // Seed once
    const seeded = await service.seedDemoScenario('DEMO');
    expect(seeded.alreadySeeded).toBe(false);
    expect(seeded.createdCount).toBe(6); // 4 Jira issues + 2 Confluence runbooks
    expect(seeded.skippedCount).toBe(0);
    expect(seeded.warnings).toHaveLength(0);
    expect(seeded.primaryIssueKey).toBeTruthy();

    // Verify seeded Jira project immediately produces BOTH BLOCK and GO verdicts
    const populated = await service.getProjectReleaseSummary('DEMO');
    expect(populated.hasDemoScenario).toBe(true);
    expect(populated.kpis.activeSev1Sev2Incidents).toBe(1);
    expect(populated.kpis.blockCount).toBeGreaterThanOrEqual(1);
    expect(populated.kpis.goCount).toBeGreaterThanOrEqual(1);

    const blockedReport = await service.evaluateIssue(seeded.primaryIssueKey!);
    expect(blockedReport.verdict).toBe('BLOCK');
    expect(blockedReport.hardBlockReasons.length).toBeGreaterThanOrEqual(2);
    expect(blockedReport.incidentCollisions).toHaveLength(1);
    expect(blockedReport.runbookAudits).toHaveLength(1);
    expect(blockedReport.runbookAudits[0].missingSections).toContain('Rollback Procedure');
  });

  it('is strictly idempotent when invoked repeatedly (zero duplicate Jira/Confluence items)', async () => {
    const client = new MockAtlassianClient({ startEmpty: true, projectKey: 'IDEM' });
    const service = new ShipGuardService(client);

    const first = await service.seedDemoScenario('IDEM');
    expect(first.alreadySeeded).toBe(false);
    expect(first.createdCount).toBe(6);

    const second = await service.seedDemoScenario('IDEM');
    expect(second.alreadySeeded).toBe(true);
    expect(second.createdCount).toBe(0);
    expect(second.existingCount).toBe(6);

    const allDemoIssues = await client.findIssuesByLabel('IDEM', 'shipguard-demo');
    expect(allDemoIssues).toHaveLength(4);
  });

  it('gracefully falls back when Confluence write permission is unavailable (still seeds all Jira issues)', async () => {
    const client = new MockAtlassianClient({ startEmpty: true, projectKey: 'PART' });
    client.simulateConfluenceWriteDenied = true;
    const service = new ShipGuardService(client);

    const result = await service.seedDemoScenario('PART');
    expect(result.alreadySeeded).toBe(false);
    expect(result.createdCount).toBe(4); // All 4 Jira items created cleanly
    expect(result.skippedCount).toBe(1); // Confluence skipped cleanly
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain('Confluence runbook creation was skipped');

    const blockedReport = await service.evaluateIssue(result.primaryIssueKey!);
    expect(blockedReport.verdict).toBe('BLOCK');
    expect(blockedReport.incidentCollisions).toHaveLength(1);
  });

  it('wires cleanly through the Forge resolver handler', async () => {
    const client = new MockAtlassianClient({ startEmpty: true, projectKey: 'RSLV' });
    const handlers = createResolverHandlers(client);

    const res = await handlers.seedDemoScenario({
      context: { extension: { project: { key: 'RSLV' } } }
    });
    expect(res.projectKey).toBe('RSLV');
    expect(res.createdCount).toBe(6);
  });
});
