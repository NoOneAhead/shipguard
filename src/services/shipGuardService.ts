import { AtlassianDataClient } from '../adapters/atlassianClient';
import { detectIncidentCollisions } from '../core/incidentMatcher';
import { normalizePolicy } from '../core/policyDefaults';
import { analyzeRunbookPage, buildRollbackRunbookStorageHtml } from '../core/runbookAnalyzer';
import { evaluateShipReadiness } from '../core/scoringEngine';
import {
  ConfluencePageData,
  DemoSeedItem,
  DemoSeedResult,
  DriftSnapshot,
  IncidentCollision,
  PolicyConfig,
  ProjectReleaseSummary,
  RunbookAuditResult,
  ShipDecisionRecord,
  ShipReadinessReport
} from '../core/types';

const DEMO_LABEL = 'shipguard-demo';

export class ShipGuardService {
  constructor(private readonly client: AtlassianDataClient) {}

  async evaluateIssue(
    issueKey: string,
    options?: { allowUserContext?: boolean; recordSnapshotEvent?: string }
  ): Promise<ShipReadinessReport> {
    const normalizedKey = issueKey.trim().toUpperCase();
    const issue = await this.client.getJiraIssue(normalizedKey);
    if (!issue) {
      throw new Error(`Jira issue "${normalizedKey}" was not found or is not accessible.`);
    }

    const [policyRaw, activeIncidents, decisionHistory, driftHistory] = await Promise.all([
      this.client.getPolicy(issue.projectKey),
      this.client.listActiveIncidents(issue.projectKey),
      this.client.getDecisions(issue.key),
      this.client.getDriftHistory(issue.key)
    ]);

    const linkedRunbooks = await this.resolveLinkedRunbooks(issue);
    const teamworkGraph = await this.client.getTeamworkGraphContext(issue, linkedRunbooks, {
      allowUserContext: options?.allowUserContext
    });

    const report = evaluateShipReadiness({
      issue,
      linkedRunbooks,
      activeIncidents,
      teamworkGraph,
      policy: policyRaw ?? undefined,
      decisionHistory,
      driftHistory
    });

    if (options?.recordSnapshotEvent) {
      const snapshot: DriftSnapshot = {
        issueKey: report.issueKey,
        score: report.score,
        verdict: report.verdict,
        blockerCount: report.findings.filter((f) => f.id.startsWith('blocker-')).length,
        incidentCollisionCount: report.incidentCollisions.length,
        recordedAt: report.evaluatedAt,
        triggerEvent: options.recordSnapshotEvent
      };
      await this.client.appendDriftSnapshot(snapshot);
    }

    return report;
  }

  async getProjectReleaseSummary(
    projectKey: string,
    maxCandidates = 20
  ): Promise<ProjectReleaseSummary> {
    const normalizedProject = projectKey.trim().toUpperCase();
    const [projectName, policyRaw, rawCandidates, activeIncidents, demoSeedInfo] = await Promise.all([
      this.client.getProjectName(normalizedProject),
      this.client.getPolicy(normalizedProject),
      this.client.listProjectReleaseCandidates(normalizedProject, maxCandidates),
      this.client.listActiveIncidents(normalizedProject),
      this.client.getDemoSeedState(normalizedProject)
    ]);

    // Filter out active incident records from release candidates so incidents appear in the Collision Guard banner
    const candidates = rawCandidates.filter((issue) => {
      const t = issue.issueType.toLowerCase();
      const lowerLabels = issue.labels.map((l) => l.toLowerCase());
      const isIncidentRecord =
        t.includes('incident') ||
        (lowerLabels.includes('incident') && (lowerLabels.includes('sev-1') || lowerLabels.includes('sev-2')));
      return !isIncidentRecord;
    });

    const hasDemoScenario =
      Boolean(demoSeedInfo && demoSeedInfo.items.some((i) => i.status !== 'SKIPPED')) ||
      rawCandidates.some(
        (i) =>
          i.labels.some((l) => l.toLowerCase() === DEMO_LABEL) ||
          i.summary.startsWith('[ShipGuard Demo]')
      );

    const policy = normalizePolicy(normalizedProject, policyRaw ?? undefined);

    const reports = await Promise.all(
      candidates.map(async (issue) => {
        const [linkedRunbooks, decisionHistory, driftHistory] = await Promise.all([
          this.resolveLinkedRunbooks(issue),
          this.client.getDecisions(issue.key),
          this.client.getDriftHistory(issue.key)
        ]);
        const teamworkGraph = await this.client.getTeamworkGraphContext(issue, linkedRunbooks, {
          allowUserContext: true
        });
        return evaluateShipReadiness({
          issue,
          linkedRunbooks,
          activeIncidents,
          teamworkGraph,
          policy,
          decisionHistory,
          driftHistory
        });
      })
    );

    const verdictRank = { BLOCK: 3, CAUTION: 2, GO: 1 };
    reports.sort((a, b) => {
      const vr = verdictRank[b.verdict] - verdictRank[a.verdict];
      if (vr !== 0) return vr;
      return a.score - b.score;
    });

    const goCount = reports.filter((r) => r.verdict === 'GO').length;
    const cautionCount = reports.filter((r) => r.verdict === 'CAUTION').length;
    const blockCount = reports.filter((r) => r.verdict === 'BLOCK').length;
    const averageScore =
      reports.length > 0
        ? Math.round(reports.reduce((acc, r) => acc + r.score, 0) / reports.length)
        : 100;
    const staleRunbooksCount = reports.filter((r) =>
      r.runbookAudits.some((rb) => rb.status !== 'HEALTHY')
    ).length;

    return {
      projectKey: normalizedProject,
      projectName,
      evaluatedAt: new Date().toISOString(),
      policy,
      hasDemoScenario,
      demoSeedInfo,
      kpis: {
        totalCandidates: reports.length,
        goCount,
        cautionCount,
        blockCount,
        averageScore,
        activeSev1Sev2Incidents: activeIncidents.filter(
          (i) => i.severity === 'SEV-1' || i.severity === 'SEV-2'
        ).length,
        staleRunbooksCount
      },
      activeIncidents,
      candidates: reports.map((r) => ({
        issueKey: r.issueKey,
        summary: r.summary,
        status: r.status,
        priority: r.priority,
        assigneeName: r.assigneeName,
        components: r.components,
        fixVersions: r.fixVersions,
        score: r.score,
        verdict: r.verdict,
        topBlocker: r.hardBlockReasons[0] ?? r.findings[0]?.title,
        incidentCollisionCount: r.incidentCollisions.length,
        runbookStatus:
          r.runbookAudits.length === 0
            ? 'MISSING'
            : [...r.runbookAudits].sort((a, b) => b.score - a.score)[0].status,
        blastRadiusTier: r.blastRadius.blastRadiusTier,
        hasOverride: r.latestDecision?.decision === 'OVERRIDDEN'
      }))
    };
  }

  async checkIncidentCollisionsForIssue(issueKey: string): Promise<{
    issueKey: string;
    collisions: IncidentCollision[];
    activeIncidentsScanned: number;
    safeToDeploy: boolean;
  }> {
    const normalizedKey = issueKey.trim().toUpperCase();
    const issue = await this.client.getJiraIssue(normalizedKey);
    if (!issue) {
      throw new Error(`Jira issue "${normalizedKey}" was not found.`);
    }
    const [activeIncidents, linkedPages] = await Promise.all([
      this.client.listActiveIncidents(issue.projectKey),
      this.resolveLinkedRunbooks(issue)
    ]);
    const teamworkGraph = await this.client.getTeamworkGraphContext(issue, linkedPages);
    const collisions = detectIncidentCollisions(issue, activeIncidents, teamworkGraph);

    return {
      issueKey: issue.key,
      collisions,
      activeIncidentsScanned: activeIncidents.length,
      safeToDeploy: !collisions.some(
        (c) => c.impactLevel === 'CRITICAL' || c.impactLevel === 'HIGH'
      )
    };
  }

  async auditConfluencePage(
    pageId: string,
    projectKey?: string
  ): Promise<{
    audit: RunbookAuditResult;
    relatedIssues: Array<{ issueKey: string; summary: string; status: string }>;
  }> {
    const page = await this.client.getConfluencePage(pageId);
    if (!page) {
      throw new Error(`Confluence page "${pageId}" was not found or is not accessible.`);
    }
    const policy = normalizePolicy(
      projectKey ?? 'DEFAULT',
      projectKey ? (await this.client.getPolicy(projectKey)) ?? undefined : undefined
    );
    const audit = analyzeRunbookPage(page, policy.runbookFreshnessSlaDays);

    let relatedIssues: Array<{ issueKey: string; summary: string; status: string }> = [];
    if (projectKey) {
      const candidates = await this.client.listProjectReleaseCandidates(projectKey, 25);
      relatedIssues = candidates
        .filter((c) => c.remoteLinks.some((rl) => rl.pageId === page.id || rl.url === page.url))
        .map((c) => ({ issueKey: c.key, summary: c.summary, status: c.status }));
    }

    return { audit, relatedIssues };
  }

  async postReadinessAuditComment(issueKey: string): Promise<{
    issueKey: string;
    commentId: string;
    report: ShipReadinessReport;
  }> {
    const report = await this.evaluateIssue(issueKey);
    const topFindings =
      report.findings.length > 0
        ? report.findings
            .slice(0, 5)
            .map((f) => `- [${f.severity}] ${f.title}: ${f.remediation}`)
            .join('\n')
        : '- No open release blockers or incident collisions detected.';

    const body = [
      `[ShipGuard Release Readiness Audit] ${report.issueKey}`,
      `Verdict: ${report.verdict} | Score: ${report.score}/100 | Blast Radius: ${report.blastRadius.blastRadiusTier}`,
      `Dimensions: Dependencies ${report.dimensions[0].score} | Runbook ${report.dimensions[1].score} | Incidents ${report.dimensions[2].score} | Teamwork Graph ${report.dimensions[3].score} | Governance ${report.dimensions[4].score}`,
      report.hardBlockReasons.length > 0
        ? `Hard Block Gates: ${report.hardBlockReasons.join('; ')}`
        : 'Hard Block Gates: None triggered',
      'Key Findings & Actions:',
      topFindings,
      `Evaluated at ${report.evaluatedAt}`
    ].join('\n');

    const { commentId } = await this.client.addJiraIssueComment(report.issueKey, body);
    return { issueKey: report.issueKey, commentId, report };
  }

  async createRollbackRunbookStub(
    issueKey: string,
    spaceKey?: string
  ): Promise<{
    page: ConfluencePageData;
    report: ShipReadinessReport;
  }> {
    const normalizedKey = issueKey.trim().toUpperCase();
    const issue = await this.client.getJiraIssue(normalizedKey);
    if (!issue) {
      throw new Error(`Jira issue "${normalizedKey}" was not found.`);
    }

    const storageHtml = buildRollbackRunbookStorageHtml({
      issueKey: issue.key,
      issueSummary: issue.summary,
      components: issue.components,
      ownerName: issue.assignee?.displayName ?? 'Release On-Call Owner',
      fixVersions: issue.fixVersions
    });

    const page = await this.client.createConfluenceRunbookPage({
      spaceKey: spaceKey ?? 'PAYENG',
      title: `[Runbook] ${issue.key} — ${issue.summary}`,
      storageHtml
    });

    await this.client.addJiraRemoteLink(issue.key, page.title, page.url);
    const report = await this.evaluateIssue(issue.key);
    return { page, report };
  }

  async recordDecision(params: {
    issueKey: string;
    decision: ShipDecisionRecord['decision'];
    justification: string;
    actorName?: string;
    postJiraComment?: boolean;
  }): Promise<{
    record: ShipDecisionRecord;
    report: ShipReadinessReport;
  }> {
    const trimmedJustification = params.justification.trim();
    if (trimmedJustification.length < 8) {
      throw new Error('Justification must be at least 8 characters long for audit compliance.');
    }

    const beforeReport = await this.evaluateIssue(params.issueKey);
    const record: ShipDecisionRecord = {
      id: `dec-${Date.now()}`,
      issueKey: beforeReport.issueKey,
      projectKey: beforeReport.projectKey,
      decision: params.decision,
      previousScore: beforeReport.score,
      previousVerdict: beforeReport.verdict,
      justification: trimmedJustification,
      actorName: params.actorName?.trim() || 'Release Manager',
      createdAt: new Date().toISOString()
    };

    await this.client.appendDecision(record);

    if (params.postJiraComment !== false) {
      await this.client.addJiraIssueComment(
        beforeReport.issueKey,
        [
          `[ShipGuard Governance Decision: ${record.decision}]`,
          `Actor: ${record.actorName}`,
          `Pre-Decision Score: ${record.previousScore}/100 (${record.previousVerdict})`,
          `Justification: ${record.justification}`,
          `Recorded at: ${record.createdAt}`
        ].join('\n')
      );
    }

    const afterReport = await this.evaluateIssue(beforeReport.issueKey);
    return { record, report: afterReport };
  }

  async updateProjectPolicy(
    projectKey: string,
    updates: Partial<PolicyConfig>,
    actorName?: string
  ): Promise<PolicyConfig> {
    const existing = await this.client.getPolicy(projectKey);
    const merged = normalizePolicy(projectKey.trim().toUpperCase(), {
      ...(existing ?? {}),
      ...updates,
      updatedAt: new Date().toISOString(),
      updatedBy: actorName ?? 'Project Release Admin'
    });
    return this.client.savePolicy(merged);
  }

  async seedDemoScenario(
    projectKey: string,
    options?: { spaceKey?: string; force?: boolean }
  ): Promise<DemoSeedResult> {
    const normalizedProject = projectKey.trim().toUpperCase();
    const warnings: string[] = [];

    if (!options?.force) {
      const existingDemoIssues = await this.client.findIssuesByLabel(normalizedProject, DEMO_LABEL);
      if (existingDemoIssues.length > 0) {
        const cached = await this.client.getDemoSeedState(normalizedProject);
        const existingItems: DemoSeedItem[] =
          cached?.items.map((item) => ({
            ...item,
            status: item.status === 'SKIPPED' ? 'SKIPPED' : 'EXISTING'
          })) ??
          existingDemoIssues.map((iss) => ({
            kind: iss.labels.some((l) => l.toLowerCase() === 'sev-1')
              ? 'JIRA_INCIDENT'
              : iss.labels.some((l) => l.toLowerCase() === 'qa-approved')
                ? 'JIRA_STORY_READY'
                : 'JIRA_STORY_BLOCKED',
            keyOrId: iss.key,
            title: iss.summary,
            status: 'EXISTING'
          }));

        const primary =
          existingItems.find((i) => i.kind === 'JIRA_STORY_BLOCKED')?.keyOrId ??
          existingDemoIssues[0]?.key;

        return {
          projectKey: normalizedProject,
          alreadySeeded: true,
          createdCount: 0,
          existingCount: existingItems.filter((i) => i.status === 'EXISTING').length,
          skippedCount: existingItems.filter((i) => i.status === 'SKIPPED').length,
          warnings: cached?.warnings ?? [],
          items: existingItems,
          seededAt: cached?.seededAt ?? new Date().toISOString(),
          primaryIssueKey: primary
        };
      }
    }

    const items: DemoSeedItem[] = [];

    // 1. Critical Story (will evaluate as BLOCK due to blocker + SEV-1 collision + incomplete runbook)
    const blockedStory = await this.client.createJiraIssue({
      projectKey: normalizedProject,
      summary: '[ShipGuard Demo] Switch Checkout Webhook Signing to Dual-Key HMAC',
      description:
        'Rotate HMAC signing secrets with dual-key verification window on checkout-webhooks and payment-gateway without dropping merchant callbacks.',
      issueTypeCandidates: ['Story', 'Task', 'Bug'],
      priorityName: 'Highest',
      labels: [DEMO_LABEL, 'checkout-webhooks', 'payments', 'security-sensitive', 'webhooks']
    });
    items.push({
      kind: 'JIRA_STORY_BLOCKED',
      keyOrId: blockedStory.key,
      title: '[ShipGuard Demo] Switch Checkout Webhook Signing to Dual-Key HMAC',
      url: blockedStory.url,
      status: 'CREATED',
      note: 'High-risk release candidate blocked by dependency + active SEV-1 collision'
    });

    // 2. Unresolved Blocker Issue linked via Blocks -> blockedStory
    const blockerIssue = await this.client.createJiraIssue({
      projectKey: normalizedProject,
      summary: '[ShipGuard Demo] Provision Secondary KMS Signing Key in EU-West Vault',
      description:
        'Prerequisite security infrastructure task blocking dual-key HMAC rollout in checkout-webhooks.',
      issueTypeCandidates: ['Task', 'Story', 'Bug'],
      priorityName: 'High',
      labels: [DEMO_LABEL, 'checkout-webhooks']
    });
    const linked = await this.client.createJiraIssueLink({
      inwardIssueKey: blockerIssue.key,
      outwardIssueKey: blockedStory.key,
      linkTypeName: 'Blocks'
    });
    if (!linked) {
      warnings.push(
        `Could not create Jira "Blocks" link between ${blockerIssue.key} and ${blockedStory.key} (link type may differ on this site).`
      );
    }
    items.push({
      kind: 'JIRA_BLOCKER',
      keyOrId: blockerIssue.key,
      title: '[ShipGuard Demo] Provision Secondary KMS Signing Key in EU-West Vault',
      url: blockerIssue.url,
      status: 'CREATED',
      note: linked ? `Blocks ${blockedStory.key}` : 'Created (link skipped)'
    });

    // 3. Active SEV-1 Incident overlapping on checkout-webhooks & payments
    const sev1Incident = await this.client.createJiraIssue({
      projectKey: normalizedProject,
      summary: '[ShipGuard Demo] SEV-1 Elevated Signature Verification Failures on checkout-webhooks',
      description:
        'Active SEV-1 production outage causing merchant callback signature verification errors on checkout-webhooks EU cluster.',
      issueTypeCandidates: ['Incident', '[System] Incident', 'Bug', 'Task'],
      priorityName: 'Highest',
      labels: [DEMO_LABEL, 'sev-1', 'incident', 'checkout-webhooks', 'payments', 'webhooks']
    });
    items.push({
      kind: 'JIRA_INCIDENT',
      keyOrId: sev1Incident.key,
      title: '[ShipGuard Demo] SEV-1 Elevated Signature Verification Failures on checkout-webhooks',
      url: sev1Incident.url,
      status: 'CREATED',
      note: 'Active SEV-1 collision on checkout-webhooks & payments'
    });

    // 4. Healthy Green-Light Story (will evaluate as GO)
    const readyStory = await this.client.createJiraIssue({
      projectKey: normalizedProject,
      summary: '[ShipGuard Demo] Add Currency Rounding Telemetry for JPY Invoices',
      description:
        'Emit zero-decimal currency rounding telemetry events from invoicing-api with full QA sign-off and complete runbook.',
      issueTypeCandidates: ['Story', 'Task'],
      priorityName: 'Medium',
      labels: [DEMO_LABEL, 'qa-approved', 'telemetry', 'invoicing-api']
    });
    items.push({
      kind: 'JIRA_STORY_READY',
      keyOrId: readyStory.key,
      title: '[ShipGuard Demo] Add Currency Rounding Telemetry for JPY Invoices',
      url: readyStory.url,
      status: 'CREATED',
      note: 'Clean green-light release candidate (GO)'
    });

    // 5. Incomplete Confluence Runbook Stub linked to Blocked Story (graceful partial-permission fallback)
    try {
      const incompleteRunbook = await this.client.createConfluenceRunbookPage({
        spaceKey: options?.spaceKey,
        title: `[ShipGuard Demo] ${blockedStory.key} Checkout Webhooks Deployment Guide`,
        storageHtml: [
          `<p>Service deployment guide seeded by <strong>ShipGuard Release Guardian</strong> for <code>${blockedStory.key}</code>.</p>`,
          `<h2>Monitoring &amp; Alerts</h2>`,
          `<p>Watch Datadog webhook HTTP 5xx error rate and signature validation latency metrics for 20 minutes.</p>`,
          `<h2>Post-Deploy Verification</h2>`,
          `<p>Confirm test merchant webhook payloads succeed in EU staging before enabling production traffic cutover.</p>`
        ].join('\n')
      });
      await this.client.addJiraRemoteLink(
        blockedStory.key,
        incompleteRunbook.title,
        incompleteRunbook.url
      );
      items.push({
        kind: 'CONFLUENCE_RUNBOOK',
        keyOrId: incompleteRunbook.id,
        title: incompleteRunbook.title,
        url: incompleteRunbook.url,
        status: 'CREATED',
        note: `Incomplete runbook linked to ${blockedStory.key} (missing Rollback Procedure)`
      });

      // Also attach a healthy 100/100 runbook to the green-light story so judges see GO vs BLOCK contrast
      const healthyRunbook = await this.client.createConfluenceRunbookPage({
        spaceKey: options?.spaceKey,
        title: `[ShipGuard Demo] ${readyStory.key} Invoicing Telemetry Production Runbook`,
        storageHtml: buildRollbackRunbookStorageHtml({
          issueKey: readyStory.key,
          issueSummary: 'Add Currency Rounding Telemetry for JPY Invoices',
          components: ['invoicing-api'],
          ownerName: 'Billing Core On-Call',
          fixVersions: ['v2026.12.demo']
        })
      });
      await this.client.addJiraRemoteLink(readyStory.key, healthyRunbook.title, healthyRunbook.url);
      items.push({
        kind: 'CONFLUENCE_RUNBOOK',
        keyOrId: healthyRunbook.id,
        title: healthyRunbook.title,
        url: healthyRunbook.url,
        status: 'CREATED',
        note: `100/100 compliant runbook linked to ${readyStory.key}`
      });
    } catch (err: any) {
      const reason = err?.message ?? 'Confluence write permission or accessible space unavailable';
      warnings.push(
        `Jira demo issues were created successfully, but Confluence runbook creation was skipped: ${reason}`
      );
      items.push({
        kind: 'CONFLUENCE_RUNBOOK',
        keyOrId: 'SKIPPED',
        title: `[ShipGuard Demo] ${blockedStory.key} Checkout Webhooks Deployment Guide`,
        status: 'SKIPPED',
        note: reason
      });
    }

    const result: DemoSeedResult = {
      projectKey: normalizedProject,
      alreadySeeded: false,
      createdCount: items.filter((i) => i.status === 'CREATED').length,
      existingCount: 0,
      skippedCount: items.filter((i) => i.status === 'SKIPPED').length,
      warnings,
      items,
      seededAt: new Date().toISOString(),
      primaryIssueKey: blockedStory.key
    };

    await this.client.saveDemoSeedState(normalizedProject, result);
    return result;
  }

  private async resolveLinkedRunbooks(issue: {
    remoteLinks: Array<{ pageId?: string; url: string; title: string }>;
    components: string[];
  }): Promise<ConfluencePageData[]> {
    const pages: ConfluencePageData[] = [];
    const seenIds = new Set<string>();

    for (const rl of issue.remoteLinks) {
      if (rl.pageId && !seenIds.has(rl.pageId)) {
        const page = await this.client.getConfluencePage(rl.pageId);
        if (page) {
          seenIds.add(page.id);
          pages.push(page);
        }
      }
    }

    if (pages.length === 0 && issue.components.length > 0) {
      const discovered = await this.client.searchConfluenceRunbooks(issue.components, 2);
      for (const p of discovered) {
        if (!seenIds.has(p.id)) {
          seenIds.add(p.id);
          pages.push(p);
        }
      }
    }

    return pages;
  }
}
