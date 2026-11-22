import { createDefaultPolicy } from '../core/policyDefaults';
import {
  ActiveIncidentData,
  ConfluencePageData,
  DemoSeedResult,
  DriftSnapshot,
  JiraIssueData,
  PolicyConfig,
  ShipDecisionRecord,
  TeamworkGraphContextData
} from '../core/types';
import {
  AtlassianDataClient,
  CreateJiraIssueInput,
  CreateJiraIssueLinkInput,
  CreateRunbookPageInput
} from './atlassianClient';

function daysAgoIso(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
}

export class MockAtlassianClient implements AtlassianDataClient {
  private readonly projectNames = new Map<string, string>([
    ['PAY', 'Payments & Checkout Platform']
  ]);
  private readonly issues = new Map<string, JiraIssueData>();
  private readonly pages = new Map<string, ConfluencePageData>();
  private readonly incidents: ActiveIncidentData[] = [];
  private readonly twgMap = new Map<string, TeamworkGraphContextData>();
  private readonly policies = new Map<string, PolicyConfig>();
  private readonly decisions = new Map<string, ShipDecisionRecord[]>();
  private readonly drift = new Map<string, DriftSnapshot[]>();
  private readonly demoSeeds = new Map<string, DemoSeedResult>();
  private readonly comments = new Map<string, Array<{ id: string; body: string; createdAt: string }>>();
  private nextPageSeq = 201;
  private nextIssueSeq = 501;
  public simulateConfluenceWriteDenied = false;

  constructor(options?: { startEmpty?: boolean; projectKey?: string; projectName?: string }) {
    if (options?.projectKey && options?.projectName) {
      this.projectNames.set(options.projectKey.toUpperCase(), options.projectName);
    }
    if (!options?.startEmpty) {
      this.seedDemoWorkspace();
    } else {
      const pk = (options.projectKey ?? 'PAY').toUpperCase();
      this.policies.set(pk, createDefaultPolicy(pk));
    }
  }

  public clearForEmptySiteMode(projectKey = 'PAY'): void {
    const upper = projectKey.toUpperCase();
    for (const [k, issue] of this.issues.entries()) {
      if (issue.projectKey.toUpperCase() === upper) {
        this.issues.delete(k);
      }
    }
    this.incidents.length = 0;
    this.demoSeeds.delete(upper);
    this.decisions.clear();
    this.drift.clear();
    this.policies.set(upper, createDefaultPolicy(upper));
  }

  public resetDefaultSeededWorkspace(): void {
    this.issues.clear();
    this.pages.clear();
    this.incidents.length = 0;
    this.twgMap.clear();
    this.policies.clear();
    this.decisions.clear();
    this.drift.clear();
    this.demoSeeds.clear();
    this.comments.clear();
    this.nextPageSeq = 201;
    this.nextIssueSeq = 501;
    this.seedDemoWorkspace();
  }

  private seedDemoWorkspace(): void {
    this.policies.set('PAY', createDefaultPolicy('PAY'));

    // Seed Confluence Runbooks
    const staleRunbook: ConfluencePageData = {
      id: 'CONF-101',
      title: 'Checkout Webhooks Production Deployment Guide',
      spaceKey: 'PAYENG',
      spaceId: 'space-payeng',
      url: 'https://demo-shipguard.atlassian.net/wiki/spaces/PAYENG/pages/101/Checkout+Webhooks+Guide',
      versionNumber: 7,
      updatedAt: daysAgoIso(74),
      authorName: 'Priya Nair',
      labels: ['runbook', 'checkout-webhooks'],
      bodyText: `
        <h2>Overview</h2>
        <p>Service overview for checkout-webhooks ingestion workers handling Stripe &amp; Adyen callbacks.</p>
        <h2>Monitoring &amp; Alerts</h2>
        <p>Datadog dashboard shows webhook HTTP 5xx error rate and signature validation latency metrics.</p>
        <h2>Post-Deploy Verification</h2>
        <p>Verify test webhook payload delivery in staging and check queue depth remains below 500.</p>
      `
    };

    const partialRunbook: ConfluencePageData = {
      id: 'CONF-102',
      title: 'Ledger Settlement Worker Runbook & Rollback Plan',
      spaceKey: 'PAYENG',
      spaceId: 'space-payeng',
      url: 'https://demo-shipguard.atlassian.net/wiki/spaces/PAYENG/pages/102/Ledger+Settlement+Runbook',
      versionNumber: 12,
      updatedAt: daysAgoIso(19),
      authorName: 'Marcus Chen',
      labels: ['runbook', 'ledger-worker'],
      bodyText: `
        <h2>Rollback Procedure</h2>
        <p>Flip feature flag <code>ledger.idempotent-batch.enabled</code> to false and revert worker deployment to previous image tag.</p>
        <h2>Monitoring &amp; Alerts</h2>
        <p>Watch Grafana P95 settlement latency and dead-letter queue alerts for 30 minutes.</p>
        <h2>On-Call Escalation</h2>
        <p>Primary owner: Ledger Platform SRE via Opsgenie schedule and #ops-ledger-alerts.</p>
        <h2>Post-Deploy Verification</h2>
        <p>Confirm double-entry ledger reconciliation job passes without variance.</p>
      `
    };

    const healthyRunbook: ConfluencePageData = {
      id: 'CONF-103',
      title: 'Multi-Currency Invoice & Receipt Service Runbook',
      spaceKey: 'PAYENG',
      spaceId: 'space-payeng',
      url: 'https://demo-shipguard.atlassian.net/wiki/spaces/PAYENG/pages/103/Invoice+Service+Runbook',
      versionNumber: 15,
      updatedAt: daysAgoIso(4),
      authorName: 'Elena Rostova',
      labels: ['runbook', 'invoicing-api'],
      bodyText: `
        <h2>1. Rollback Procedure</h2>
        <p>Disable feature flag <code>invoice.jpy-telemetry</code> and revert Helm release via ArgoCD rollback command.</p>
        <h2>2. Monitoring &amp; Alerts</h2>
        <p>Check Datadog SLO burn-rate alerts, HTTP 5xx error rate, and currency rounding telemetry dashboard.</p>
        <h2>3. Health Checks &amp; Smoke Tests</h2>
        <p>Verify <code>/healthz</code> and <code>/readyz</code> endpoints return 200 and execute automated canary smoke test suite.</p>
        <h2>4. On-Call Owner &amp; Escalation</h2>
        <p>Primary Owner: Billing Core On-Call (PagerDuty Billing-L1) | Escalation: #ops-billing-core.</p>
        <h2>5. Post-Deploy Verification Steps</h2>
        <p>Validate JPY and KRW invoice rounding metrics across canary pods before full 100% cutover.</p>
      `
    };

    for (const page of [staleRunbook, partialRunbook, healthyRunbook]) {
      this.pages.set(page.id, page);
    }

    // Seed Active Incidents (JSM / Jira)
    this.incidents.push(
      {
        key: 'INC-889',
        summary: 'SEV-1 Elevated signature verification failures on checkout-webhooks EU cluster',
        severity: 'SEV-1',
        status: 'Investigating',
        components: ['checkout-webhooks'],
        labels: ['sev-1', 'payments', 'webhooks'],
        affectedServices: ['checkout-webhooks', 'payment-gateway'],
        ownerName: 'Devon Brooks (Incident Commander)',
        createdAt: daysAgoIso(0),
        url: 'https://demo-shipguard.atlassian.net/browse/INC-889'
      },
      {
        key: 'INC-894',
        summary: 'SEV-2 Ledger settlement batch consumer P99 latency spike during EU close',
        severity: 'SEV-2',
        status: 'Mitigating',
        components: ['ledger-worker'],
        labels: ['sev-2', 'latency'],
        affectedServices: ['ledger-worker'],
        ownerName: 'Sora Takahashi',
        createdAt: daysAgoIso(0),
        url: 'https://demo-shipguard.atlassian.net/browse/INC-894'
      }
    );

    // Seed 6 Realistic Release Candidates
    const issues: JiraIssueData[] = [
      {
        id: '10412',
        key: 'PAY-412',
        projectKey: 'PAY',
        summary: 'Switch Checkout Webhook Signing to Dual-Key HMAC Rotation',
        description:
          'Rotate HMAC signing secrets with dual-key verification window on checkout-webhooks and payment-gateway without dropping merchant callbacks.',
        status: 'In Review',
        statusCategory: 'In Progress',
        issueType: 'Story',
        priority: 'Highest',
        assignee: { accountId: 'u-priya', displayName: 'Priya Nair' },
        reporter: { accountId: 'u-alex', displayName: 'Alex Rivera' },
        labels: ['payments', 'security-sensitive', 'webhooks'],
        components: ['checkout-webhooks', 'payment-gateway'],
        fixVersions: ['v2026.12.1'],
        createdAt: daysAgoIso(9),
        updatedAt: daysAgoIso(0),
        storyPoints: 8,
        issueLinks: [
          {
            key: 'PAY-408',
            summary: 'Provision Secondary KMS Signing Key in EU-West Vault',
            status: 'In Progress',
            statusCategory: 'In Progress',
            issueType: 'Task',
            priority: 'Highest',
            linkType: 'is blocked by',
            direction: 'inward'
          },
          {
            key: 'PAY-401',
            summary: 'Replay buffer drops headers >8KB on retry',
            status: 'Open',
            statusCategory: 'To Do',
            issueType: 'Bug',
            priority: 'High',
            linkType: 'relates to',
            direction: 'outward'
          }
        ],
        remoteLinks: [
          {
            id: 'rl-101',
            title: 'Checkout Webhooks Production Deployment Guide',
            url: staleRunbook.url,
            applicationType: 'com.atlassian.confluence',
            pageId: 'CONF-101'
          },
          {
            id: 'rl-pr-712',
            title: 'PR #712: Dual-key HMAC verifier middleware',
            url: 'https://github.com/acme-pay/checkout-webhooks/pull/712'
          }
        ],
        subtasks: [
          {
            key: 'PAY-413',
            summary: 'Add dual-key verification unit tests',
            status: 'Done',
            statusCategory: 'Done'
          },
          {
            key: 'PAY-414',
            summary: 'Run chaos failover test in EU staging',
            status: 'In Progress',
            statusCategory: 'In Progress'
          }
        ],
        commentsCount: 6,
        hasQaSignOff: false,
        hasSecurityReview: false
      },
      {
        id: '10419',
        key: 'PAY-419',
        projectKey: 'PAY',
        summary: 'Migrate Ledger Settlement Worker to Idempotent Batch Consumer',
        description:
          'Introduce idempotency token deduplication and adaptive batch sizing in ledger-worker to handle end-of-day settlement bursts.',
        status: 'Ready for QA',
        statusCategory: 'In Progress',
        issueType: 'Story',
        priority: 'High',
        assignee: { accountId: 'u-marcus', displayName: 'Marcus Chen' },
        reporter: { accountId: 'u-elena', displayName: 'Elena Rostova' },
        labels: ['ledger', 'throughput'],
        components: ['ledger-worker'],
        fixVersions: ['v2026.12.1'],
        createdAt: daysAgoIso(12),
        updatedAt: daysAgoIso(1),
        storyPoints: 5,
        issueLinks: [],
        remoteLinks: [
          {
            id: 'rl-102',
            title: 'Ledger Settlement Worker Runbook & Rollback Plan',
            url: partialRunbook.url,
            applicationType: 'com.atlassian.confluence',
            pageId: 'CONF-102'
          }
        ],
        subtasks: [
          {
            key: 'PAY-420',
            summary: 'Benchmark idempotency table lock contention',
            status: 'In Progress',
            statusCategory: 'In Progress'
          }
        ],
        commentsCount: 4,
        hasQaSignOff: true,
        hasSecurityReview: true
      },
      {
        id: '10425',
        key: 'PAY-425',
        projectKey: 'PAY',
        summary: 'Add Currency Rounding Telemetry for JPY & KRW Invoices',
        description:
          'Emit structured zero-decimal currency rounding telemetry events from invoicing-api to improve finance reconciliation accuracy.',
        status: 'Ready for Release',
        statusCategory: 'In Progress',
        issueType: 'Story',
        priority: 'Medium',
        assignee: { accountId: 'u-elena', displayName: 'Elena Rostova' },
        reporter: { accountId: 'u-elena', displayName: 'Elena Rostova' },
        labels: ['telemetry', 'qa-approved'],
        components: ['invoicing-api'],
        fixVersions: ['v2026.12.1'],
        createdAt: daysAgoIso(6),
        updatedAt: daysAgoIso(0),
        storyPoints: 3,
        issueLinks: [],
        remoteLinks: [
          {
            id: 'rl-103',
            title: 'Multi-Currency Invoice & Receipt Service Runbook',
            url: healthyRunbook.url,
            applicationType: 'com.atlassian.confluence',
            pageId: 'CONF-103'
          }
        ],
        subtasks: [
          {
            key: 'PAY-426',
            summary: 'Add Datadog rounding variance metric panel',
            status: 'Done',
            statusCategory: 'Done'
          }
        ],
        commentsCount: 3,
        hasQaSignOff: true,
        hasSecurityReview: true
      },
      {
        id: '10428',
        key: 'PAY-428',
        projectKey: 'PAY',
        summary: 'Drop Legacy v1 Token Vault Columns in PostgreSQL',
        description:
          'Execute destructive schema cleanup removing deprecated v1 card token columns from vault_tokens table after v2 migration.',
        status: 'In Review',
        statusCategory: 'In Progress',
        issueType: 'Task',
        priority: 'Highest',
        assignee: { accountId: 'u-jordan', displayName: 'Jordan Park' },
        reporter: { accountId: 'u-priya', displayName: 'Priya Nair' },
        labels: ['db-migration', 'breaking-change', 'pci'],
        components: ['token-vault'],
        fixVersions: ['v2026.12.2'],
        createdAt: daysAgoIso(8),
        updatedAt: daysAgoIso(0),
        storyPoints: 5,
        issueLinks: [
          {
            key: 'PAY-422',
            summary: 'Confirm zero reads on v1 token_hash column across batch ETL',
            status: 'In Progress',
            statusCategory: 'In Progress',
            issueType: 'Task',
            priority: 'High',
            linkType: 'is blocked by',
            direction: 'inward'
          }
        ],
        remoteLinks: [],
        subtasks: [],
        commentsCount: 5,
        hasQaSignOff: false,
        hasSecurityReview: false
      },
      {
        id: '10431',
        key: 'PAY-431',
        projectKey: 'PAY',
        summary: 'Upgrade Fraud Scoring SDK to v4.2 with Async Timeout Guard',
        description:
          'Bump fraud-engine client SDK and enforce 220ms circuit-breaker fallback during peak checkout load.',
        status: 'In Review',
        statusCategory: 'In Progress',
        issueType: 'Story',
        priority: 'High',
        assignee: { accountId: 'u-samira', displayName: 'Samira Al-Mansoor' },
        reporter: { accountId: 'u-alex', displayName: 'Alex Rivera' },
        labels: ['resilience', 'fraud-engine'],
        components: ['fraud-engine'],
        fixVersions: ['v2026.12.1'],
        createdAt: daysAgoIso(5),
        updatedAt: daysAgoIso(1),
        storyPoints: 3,
        issueLinks: [
          {
            key: 'PAY-429',
            summary: 'Circuit-breaker fallback metric emits duplicate tags',
            status: 'Open',
            statusCategory: 'To Do',
            issueType: 'Bug',
            priority: 'Medium',
            linkType: 'relates to',
            direction: 'outward'
          }
        ],
        remoteLinks: [
          {
            id: 'rl-103b',
            title: 'Multi-Currency Invoice & Receipt Service Runbook',
            url: healthyRunbook.url,
            applicationType: 'com.atlassian.confluence',
            pageId: 'CONF-103'
          }
        ],
        subtasks: [],
        commentsCount: 2,
        hasQaSignOff: false,
        hasSecurityReview: true
      },
      {
        id: '10435',
        key: 'PAY-435',
        projectKey: 'PAY',
        summary: 'Expose Checkout Receipt PDF Endpoint with Adaptive Rate Limits',
        description:
          'Serve cached merchant receipt PDFs from invoicing-api with per-tenant token bucket throttling.',
        status: 'Ready for Release',
        statusCategory: 'In Progress',
        issueType: 'Story',
        priority: 'Medium',
        assignee: { accountId: 'u-elena', displayName: 'Elena Rostova' },
        reporter: { accountId: 'u-marcus', displayName: 'Marcus Chen' },
        labels: ['qa-approved', 'api'],
        components: ['invoicing-api'],
        fixVersions: ['v2026.12.1'],
        createdAt: daysAgoIso(4),
        updatedAt: daysAgoIso(0),
        storyPoints: 3,
        issueLinks: [],
        remoteLinks: [
          {
            id: 'rl-103c',
            title: 'Multi-Currency Invoice & Receipt Service Runbook',
            url: healthyRunbook.url,
            applicationType: 'com.atlassian.confluence',
            pageId: 'CONF-103'
          }
        ],
        subtasks: [],
        commentsCount: 2,
        hasQaSignOff: true,
        hasSecurityReview: true
      }
    ];

    for (const issue of issues) {
      this.issues.set(issue.key, issue);
    }

    // Seed Teamwork Graph traversals
    this.twgMap.set('PAY-412', {
      source: 'TEAMWORK_GRAPH_API',
      available: true,
      note: 'Teamwork Graph traversed 3 hops across Jira, Confluence, JSM, GitHub PRs, and Atlassian Teams.',
      owningTeams: [
        { id: 'team-checkout-core', name: 'Checkout Core Engineering', memberCount: 9 },
        { id: 'team-pay-sec', name: 'Payments Security Guild', memberCount: 5 }
      ],
      connectedContributors: [
        { id: 'u-priya', name: 'Priya Nair', role: 'Release Assignee' },
        { id: 'u-devon', name: 'Devon Brooks', role: 'Incident Commander' },
        { id: 'u-alex', name: 'Alex Rivera', role: 'PR Reviewer' }
      ],
      linkedPullRequests: [
        {
          id: 'PR-712',
          title: 'feat(webhooks): dual-key HMAC verification middleware',
          status: 'CHANGES_REQUESTED',
          reviewersApproved: 0,
          url: 'https://github.com/acme-pay/checkout-webhooks/pull/712'
        }
      ],
      crossProductPages: [
        { id: staleRunbook.id, title: staleRunbook.title, url: staleRunbook.url }
      ],
      impactedServices: [
        'checkout-webhooks',
        'payment-gateway',
        'merchant-callback-router',
        'eu-edge-ingress'
      ],
      hopCount: 3
    });

    this.twgMap.set('PAY-419', {
      source: 'TEAMWORK_GRAPH_API',
      available: true,
      note: 'Teamwork Graph connected Ledger Platform Team, 1 open PR, and Confluence Settlement Runbook.',
      owningTeams: [{ id: 'team-ledger', name: 'Ledger Platform Team', memberCount: 7 }],
      connectedContributors: [
        { id: 'u-marcus', name: 'Marcus Chen', role: 'Release Assignee' },
        { id: 'u-sora', name: 'Sora Takahashi', role: 'On-Call SRE' }
      ],
      linkedPullRequests: [
        {
          id: 'PR-684',
          title: 'perf(ledger): idempotent batch consumer with backoff',
          status: 'OPEN',
          reviewersApproved: 0,
          url: 'https://github.com/acme-pay/ledger-worker/pull/684'
        }
      ],
      crossProductPages: [
        { id: partialRunbook.id, title: partialRunbook.title, url: partialRunbook.url }
      ],
      impactedServices: ['ledger-worker', 'settlement-db'],
      hopCount: 2
    });

    this.twgMap.set('PAY-425', {
      source: 'TEAMWORK_GRAPH_API',
      available: true,
      note: 'Teamwork Graph verified Billing Core ownership, merged PR-701, and fresh Confluence runbook.',
      owningTeams: [{ id: 'team-billing', name: 'Billing Core Team', memberCount: 6 }],
      connectedContributors: [
        { id: 'u-elena', name: 'Elena Rostova', role: 'Release Assignee' },
        { id: 'u-marcus', name: 'Marcus Chen', role: 'PR Approver' }
      ],
      linkedPullRequests: [
        {
          id: 'PR-701',
          title: 'feat(invoicing): emit JPY & KRW rounding telemetry',
          status: 'MERGED',
          reviewersApproved: 2,
          url: 'https://github.com/acme-pay/invoicing-api/pull/701'
        }
      ],
      crossProductPages: [
        { id: healthyRunbook.id, title: healthyRunbook.title, url: healthyRunbook.url }
      ],
      impactedServices: ['invoicing-api'],
      hopCount: 2
    });

    this.twgMap.set('PAY-428', {
      source: 'TEAMWORK_GRAPH_API',
      available: true,
      note: 'Teamwork Graph detected 4 downstream services referencing token-vault schema.',
      owningTeams: [{ id: 'team-vault', name: 'Vault & PCI Data Team', memberCount: 5 }],
      connectedContributors: [{ id: 'u-jordan', name: 'Jordan Park', role: 'Release Assignee' }],
      linkedPullRequests: [
        {
          id: 'PR-719',
          title: 'chore(db): drop legacy token_hash_v1 columns',
          status: 'OPEN',
          reviewersApproved: 0,
          url: 'https://github.com/acme-pay/token-vault/pull/719'
        }
      ],
      crossProductPages: [],
      impactedServices: ['token-vault', 'payment-gateway', 'recurring-billing', 'batch-etl'],
      hopCount: 3
    });

    this.twgMap.set('PAY-431', {
      source: 'TEAMWORK_GRAPH_API',
      available: true,
      note: 'Teamwork Graph mapped Risk & Fraud Team and approved PR-715.',
      owningTeams: [{ id: 'team-fraud', name: 'Risk & Fraud Engineering', memberCount: 8 }],
      connectedContributors: [{ id: 'u-samira', name: 'Samira Al-Mansoor', role: 'Release Assignee' }],
      linkedPullRequests: [
        {
          id: 'PR-715',
          title: 'chore(fraud): upgrade SDK v4.2 with timeout guard',
          status: 'MERGED',
          reviewersApproved: 2,
          url: 'https://github.com/acme-pay/fraud-engine/pull/715'
        }
      ],
      crossProductPages: [
        { id: healthyRunbook.id, title: healthyRunbook.title, url: healthyRunbook.url }
      ],
      impactedServices: ['fraud-engine', 'checkout-api'],
      hopCount: 2
    });

    this.twgMap.set('PAY-435', {
      source: 'TEAMWORK_GRAPH_API',
      available: true,
      note: 'Teamwork Graph verified Billing Core ownership and merged PR-722.',
      owningTeams: [{ id: 'team-billing', name: 'Billing Core Team', memberCount: 6 }],
      connectedContributors: [{ id: 'u-elena', name: 'Elena Rostova', role: 'Release Assignee' }],
      linkedPullRequests: [
        {
          id: 'PR-722',
          title: 'feat(receipts): cached PDF endpoint + rate limiter',
          status: 'MERGED',
          reviewersApproved: 2,
          url: 'https://github.com/acme-pay/invoicing-api/pull/722'
        }
      ],
      crossProductPages: [
        { id: healthyRunbook.id, title: healthyRunbook.title, url: healthyRunbook.url }
      ],
      impactedServices: ['invoicing-api'],
      hopCount: 2
    });

    // Seed Drift History for PAY-412 showing regression after INC-889 opened
    this.drift.set('PAY-412', [
      {
        issueKey: 'PAY-412',
        score: 64,
        verdict: 'CAUTION',
        blockerCount: 0,
        incidentCollisionCount: 0,
        recordedAt: daysAgoIso(1),
        triggerEvent: 'avi:jira:updated:issue'
      }
    ]);
  }

  async getProjectName(projectKey: string): Promise<string> {
    return this.projectNames.get(projectKey.toUpperCase()) ?? `${projectKey.toUpperCase()} Software Project`;
  }

  async getProjectIssueTypeNames(_projectKey: string): Promise<string[]> {
    return ['Story', 'Task', 'Bug', 'Incident'];
  }

  async findIssuesByLabel(projectKey: string, label: string): Promise<JiraIssueData[]> {
    const pk = projectKey.toUpperCase();
    const target = label.toLowerCase();
    return Array.from(this.issues.values())
      .filter(
        (i) =>
          i.projectKey.toUpperCase() === pk &&
          i.labels.some((l) => l.toLowerCase() === target)
      )
      .map((i) => structuredClone(i));
  }

  async createJiraIssue(
    input: CreateJiraIssueInput
  ): Promise<{ id: string; key: string; url: string }> {
    const projectKey = input.projectKey.toUpperCase();
    const seq = this.nextIssueSeq++;
    const key = `${projectKey}-${seq}`;
    const issueType = input.issueTypeCandidates[0] ?? 'Story';
    const labels = input.labels ?? [];
    const lowerLabels = new Set(labels.map((l) => l.toLowerCase()));
    const components = input.components ?? [];
    const nowIso = new Date().toISOString();

    const isIncident =
      issueType.toLowerCase() === 'incident' ||
      lowerLabels.has('sev-1') ||
      lowerLabels.has('sev-2') ||
      lowerLabels.has('incident');

    if (isIncident) {
      const severity: ActiveIncidentData['severity'] = lowerLabels.has('sev-1')
        ? 'SEV-1'
        : lowerLabels.has('sev-2')
          ? 'SEV-2'
          : 'SEV-3';
      this.incidents.unshift({
        key,
        summary: input.summary,
        severity,
        status: 'Investigating',
        components,
        labels,
        affectedServices: components.length > 0 ? components : ['checkout-webhooks'],
        ownerName: 'On-Call Incident Commander',
        createdAt: nowIso,
        url: `https://demo-shipguard.atlassian.net/browse/${key}`
      });
    }

    const issue: JiraIssueData = {
      id: String(20000 + seq),
      key,
      projectKey,
      summary: input.summary,
      description: input.description,
      status: isIncident ? 'Investigating' : lowerLabels.has('qa-approved') ? 'Ready for Release' : 'In Review',
      statusCategory: 'In Progress',
      issueType,
      priority: input.priorityName ?? 'High',
      assignee: { accountId: 'u-demo-lead', displayName: 'Priya Nair' },
      reporter: { accountId: 'u-demo-reporter', displayName: 'ShipGuard Demo Seeder' },
      labels,
      components,
      fixVersions: ['v2026.12.demo'],
      createdAt: nowIso,
      updatedAt: nowIso,
      issueLinks: [],
      remoteLinks: [],
      subtasks: [],
      commentsCount: 0,
      hasQaSignOff: lowerLabels.has('qa-approved') || lowerLabels.has('qa-verified'),
      hasSecurityReview: lowerLabels.has('security-reviewed')
    };

    this.issues.set(key, issue);
    return {
      id: issue.id,
      key,
      url: `https://demo-shipguard.atlassian.net/browse/${key}`
    };
  }

  async createJiraIssueLink(input: CreateJiraIssueLinkInput): Promise<boolean> {
    const blockedIssue = this.issues.get(input.outwardIssueKey.toUpperCase());
    const blockerIssue = this.issues.get(input.inwardIssueKey.toUpperCase());
    if (!blockedIssue || !blockerIssue) return false;

    // Jira's "Blocks" link: inwardIssue blocks outwardIssue -> outwardIssue "is blocked by" inwardIssue
    blockedIssue.issueLinks.push({
      key: blockerIssue.key,
      summary: blockerIssue.summary,
      status: blockerIssue.status,
      statusCategory: blockerIssue.statusCategory,
      issueType: blockerIssue.issueType,
      priority: blockerIssue.priority,
      linkType: 'is blocked by',
      direction: 'inward'
    });
    blockerIssue.issueLinks.push({
      key: blockedIssue.key,
      summary: blockedIssue.summary,
      status: blockedIssue.status,
      statusCategory: blockedIssue.statusCategory,
      issueType: blockedIssue.issueType,
      priority: blockedIssue.priority,
      linkType: 'blocks',
      direction: 'outward'
    });
    return true;
  }

  async getJiraIssue(issueKey: string): Promise<JiraIssueData | null> {
    const found = this.issues.get(issueKey.toUpperCase());
    return found ? structuredClone(found) : null;
  }

  async listProjectReleaseCandidates(projectKey: string, maxResults = 25): Promise<JiraIssueData[]> {
    const keyUpper = projectKey.toUpperCase();
    return Array.from(this.issues.values())
      .filter((i) => i.projectKey.toUpperCase() === keyUpper)
      .slice(0, maxResults)
      .map((i) => structuredClone(i));
  }

  async listActiveIncidents(_projectKey?: string): Promise<ActiveIncidentData[]> {
    return structuredClone(this.incidents);
  }

  async getConfluencePage(pageId: string): Promise<ConfluencePageData | null> {
    const found = this.pages.get(pageId);
    return found ? structuredClone(found) : null;
  }

  async listAllConfluencePages(): Promise<ConfluencePageData[]> {
    return Array.from(this.pages.values()).map((p) => structuredClone(p));
  }

  async searchConfluenceRunbooks(terms: string[], limit = 3): Promise<ConfluencePageData[]> {
    const normTerms = terms.map((t) => t.toLowerCase()).filter((t) => t.length >= 3);
    if (normTerms.length === 0) return [];
    const matched = Array.from(this.pages.values()).filter((p) => {
      const hay = `${p.title} ${p.labels.join(' ')} ${p.bodyText}`.toLowerCase();
      return normTerms.some((term) => hay.includes(term));
    });
    return matched.slice(0, limit).map((p) => structuredClone(p));
  }

  async createConfluenceRunbookPage(input: CreateRunbookPageInput): Promise<ConfluencePageData> {
    if (this.simulateConfluenceWriteDenied) {
      throw new Error('Confluence space write access is not granted on this test site (HTTP 403).');
    }
    const id = `CONF-${this.nextPageSeq++}`;
    const slug = encodeURIComponent(input.title.replace(/\s+/g, '+'));
    const spaceKey = input.spaceKey ?? 'PAYENG';
    const created: ConfluencePageData = {
      id,
      title: input.title,
      spaceKey,
      spaceId: input.spaceId ?? `space-${spaceKey.toLowerCase()}`,
      url: `https://demo-shipguard.atlassian.net/wiki/spaces/${spaceKey}/pages/${id}/${slug}`,
      versionNumber: 1,
      updatedAt: new Date().toISOString(),
      authorName: 'ShipGuard Release Guardian',
      bodyText: input.storageHtml,
      labels: ['runbook', 'shipguard']
    };
    this.pages.set(id, created);
    return structuredClone(created);
  }

  async addJiraIssueComment(issueKey: string, commentText: string): Promise<{ commentId: string }> {
    const upper = issueKey.toUpperCase();
    const issue = this.issues.get(upper);
    if (!issue) throw new Error(`Issue ${issueKey} not found`);
    const list = this.comments.get(upper) ?? [];
    const commentId = `cmt-${Date.now()}-${list.length + 1}`;
    list.unshift({ id: commentId, body: commentText, createdAt: new Date().toISOString() });
    this.comments.set(upper, list);
    issue.commentsCount += 1;
    return { commentId };
  }

  getIssueComments(issueKey: string) {
    return structuredClone(this.comments.get(issueKey.toUpperCase()) ?? []);
  }

  async addJiraRemoteLink(
    issueKey: string,
    title: string,
    url: string
  ): Promise<{ linkId: string }> {
    const upper = issueKey.toUpperCase();
    const issue = this.issues.get(upper);
    if (!issue) throw new Error(`Issue ${issueKey} not found`);
    const linkId = `rl-${Date.now()}`;
    const pageMatch = url.match(/pages\/(CONF-\d+|\d+)/i);
    issue.remoteLinks.push({
      id: linkId,
      title,
      url,
      applicationType: 'com.atlassian.confluence',
      pageId: pageMatch ? pageMatch[1] : undefined
    });
    return { linkId };
  }

  async getTeamworkGraphContext(
    issue: JiraIssueData,
    linkedPages: ConfluencePageData[]
  ): Promise<TeamworkGraphContextData> {
    const seeded = this.twgMap.get(issue.key);
    if (seeded) {
      return {
        ...structuredClone(seeded),
        crossProductPages: linkedPages.map((p) => ({ id: p.id, title: p.title, url: p.url }))
      };
    }
    return {
      source: 'HYBRID_FALLBACK',
      available: false,
      owningTeams: issue.components.map((c) => ({ id: `team-${c}`, name: `${c} Team` })),
      connectedContributors: issue.assignee
        ? [{ id: issue.assignee.accountId, name: issue.assignee.displayName, role: 'Assignee' }]
        : [],
      linkedPullRequests: [],
      crossProductPages: linkedPages.map((p) => ({ id: p.id, title: p.title, url: p.url })),
      impactedServices: [...issue.components],
      hopCount: 1
    };
  }

  async getPolicy(projectKey: string): Promise<PolicyConfig | null> {
    const found = this.policies.get(projectKey.toUpperCase());
    return found ? structuredClone(found) : null;
  }

  async savePolicy(policy: PolicyConfig): Promise<PolicyConfig> {
    const cloned = structuredClone(policy);
    this.policies.set(policy.projectKey.toUpperCase(), cloned);
    return structuredClone(cloned);
  }

  async getDecisions(issueKey: string): Promise<ShipDecisionRecord[]> {
    return structuredClone(this.decisions.get(issueKey.toUpperCase()) ?? []);
  }

  async appendDecision(record: ShipDecisionRecord): Promise<ShipDecisionRecord[]> {
    const upper = record.issueKey.toUpperCase();
    const existing = this.decisions.get(upper) ?? [];
    const updated = [structuredClone(record), ...existing].slice(0, 20);
    this.decisions.set(upper, updated);
    return structuredClone(updated);
  }

  async getDriftHistory(issueKey: string): Promise<DriftSnapshot[]> {
    return structuredClone(this.drift.get(issueKey.toUpperCase()) ?? []);
  }

  async appendDriftSnapshot(snapshot: DriftSnapshot): Promise<DriftSnapshot[]> {
    const upper = snapshot.issueKey.toUpperCase();
    const existing = this.drift.get(upper) ?? [];
    const updated = [structuredClone(snapshot), ...existing].slice(0, 15);
    this.drift.set(upper, updated);
    return structuredClone(updated);
  }

  async getDemoSeedState(projectKey: string): Promise<DemoSeedResult | null> {
    const found = this.demoSeeds.get(projectKey.toUpperCase());
    return found ? structuredClone(found) : null;
  }

  async saveDemoSeedState(projectKey: string, state: DemoSeedResult | null): Promise<void> {
    const upper = projectKey.toUpperCase();
    if (state === null) {
      this.demoSeeds.delete(upper);
    } else {
      this.demoSeeds.set(upper, structuredClone(state));
    }
  }
}
