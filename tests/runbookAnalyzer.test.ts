import { describe, expect, it } from 'vitest';
import {
  analyzeRunbookPage,
  buildRollbackRunbookStorageHtml,
  stripHtmlToPlainText
} from '../src/core/runbookAnalyzer';
import { ConfluencePageData } from '../src/core/types';

function makePage(overrides: Partial<ConfluencePageData> = {}): ConfluencePageData {
  return {
    id: 'CONF-900',
    title: 'Checkout Service Production Runbook',
    spaceKey: 'ENG',
    url: 'https://example.atlassian.net/wiki/spaces/ENG/pages/900',
    versionNumber: 3,
    updatedAt: new Date(Date.now() - 5 * 86400_000).toISOString(),
    bodyText: `
      <h2>Rollback Procedure</h2>
      <p>Disable feature flag and revert Helm deployment to last stable image tag.</p>
      <h2>Monitoring & Alerts</h2>
      <p>Track Datadog error rate, P95 latency, and SLO burn rate alerts.</p>
      <h2>Health Checks</h2>
      <p>Verify /healthz returns 200 and execute canary smoke test.</p>
      <h2>Escalation</h2>
      <p>Primary on-call owner on PagerDuty schedule #ops-checkout.</p>
      <h2>Post-Deploy Verification</h2>
      <p>Confirm validation steps pass across 100% traffic cutover.</p>
    `,
    labels: ['runbook'],
    ...overrides
  };
}

describe('runbookAnalyzer', () => {
  it('scores a fresh, complete runbook at 100 HEALTHY', () => {
    const result = analyzeRunbookPage(makePage(), 45);
    expect(result.score).toBe(100);
    expect(result.status).toBe('HEALTHY');
    expect(result.isStale).toBe(false);
    expect(result.missingSections).toHaveLength(0);
    expect(result.recommendations).toHaveLength(0);
  });

  it('flags a stale runbook missing Rollback Procedure as STALE_OR_INCOMPLETE', () => {
    const stalePage = makePage({
      updatedAt: new Date(Date.now() - 80 * 86400_000).toISOString(),
      bodyText: `
        <h2>Monitoring</h2>
        <p>Watch Grafana metrics and error rate dashboard after deploy for 20 minutes.</p>
        <h2>Post-Deploy Verification</h2>
        <p>Run validation steps against staging cluster before production release.</p>
      `
    });
    const result = analyzeRunbookPage(stalePage, 45);
    expect(result.isStale).toBe(true);
    expect(result.ageDays).toBeGreaterThanOrEqual(79);
    expect(result.status).toBe('STALE_OR_INCOMPLETE');
    expect(result.missingSections).toContain('Rollback Procedure');
    expect(result.score).toBeLessThan(55);
  });

  it('penalizes very short stub documents', () => {
    const stub = makePage({
      bodyText: '<p>Rollback via revert.</p>'
    });
    const result = analyzeRunbookPage(stub, 45);
    expect(result.score).toBeLessThan(40);
    expect(result.recommendations.some((r) => r.includes('stub'))).toBe(true);
  });

  it('generates a Rollback Runbook Storage XHTML stub that scores 100/100 HEALTHY', () => {
    const html = buildRollbackRunbookStorageHtml({
      issueKey: 'PAY-428',
      issueSummary: 'Drop Legacy Token Columns',
      components: ['token-vault'],
      ownerName: 'Jordan Park',
      fixVersions: ['v2026.12.2']
    });
    expect(html).toContain('PAY-428');
    expect(html).toContain('Rollback Procedure');
    const audit = analyzeRunbookPage(
      makePage({
        title: '[Runbook] PAY-428 — Drop Legacy Token Columns',
        updatedAt: new Date().toISOString(),
        bodyText: html
      }),
      45
    );
    expect(audit.score).toBe(100);
    expect(audit.status).toBe('HEALTHY');
    expect(audit.missingSections).toHaveLength(0);
  });

  it('strips HTML tags cleanly', () => {
    expect(stripHtmlToPlainText('<h2>Hello &amp; World</h2><p>Test</p>')).toBe('Hello & World Test');
  });
});
