import api, { route } from '@forge/api';
import { kvs } from '@forge/kvs';
import {
  ActiveIncidentData,
  ConfluencePageData,
  DemoSeedResult,
  DriftSnapshot,
  JiraIssueData,
  JiraIssueLinkSummary,
  JiraRemoteLink,
  PolicyConfig,
  ShipDecisionRecord,
  TeamworkGraphContextData
} from '../core/types';
import {
  TWG_ECHO_PROBE_QUERY,
  TWG_PAGE_CONTRIBUTORS_QUERY,
  TWG_USER_ASSIGNED_WORK_QUERY,
  extractConfluencePageIdFromUrl,
  toAtlassianUserAri
} from '../services/teamworkGraphQueries';
import {
  AtlassianDataClient,
  CreateJiraIssueInput,
  CreateJiraIssueLinkInput,
  CreateRunbookPageInput
} from './atlassianClient';

function extractPlainTextFromAdf(adf: unknown): string {
  if (!adf) return '';
  if (typeof adf === 'string') return adf;
  if (typeof adf !== 'object') return '';
  const node = adf as { text?: string; content?: unknown[] };
  const parts: string[] = [];
  if (typeof node.text === 'string') parts.push(node.text);
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      parts.push(extractPlainTextFromAdf(child));
    }
  }
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function mapStatusCategory(name?: string): 'To Do' | 'In Progress' | 'Done' {
  const n = (name ?? '').toLowerCase();
  if (n === 'done') return 'Done';
  if (n.includes('progress')) return 'In Progress';
  return 'To Do';
}

function mapJiraIssuePayload(raw: any, remoteLinksRaw: any[] = []): JiraIssueData {
  const fields = raw?.fields ?? {};
  const labels: string[] = Array.isArray(fields.labels) ? fields.labels : [];
  const lowerLabels = new Set(labels.map((l) => l.toLowerCase()));

  const issueLinks: JiraIssueLinkSummary[] = [];
  for (const link of fields.issuelinks ?? []) {
    if (link.inwardIssue) {
      issueLinks.push({
        key: link.inwardIssue.key,
        summary: link.inwardIssue.fields?.summary ?? '',
        status: link.inwardIssue.fields?.status?.name ?? 'Open',
        statusCategory: mapStatusCategory(link.inwardIssue.fields?.status?.statusCategory?.name),
        issueType: link.inwardIssue.fields?.issuetype?.name ?? 'Task',
        priority: link.inwardIssue.fields?.priority?.name ?? 'Medium',
        linkType: link.type?.inward ?? 'is blocked by',
        direction: 'inward'
      });
    }
    if (link.outwardIssue) {
      issueLinks.push({
        key: link.outwardIssue.key,
        summary: link.outwardIssue.fields?.summary ?? '',
        status: link.outwardIssue.fields?.status?.name ?? 'Open',
        statusCategory: mapStatusCategory(link.outwardIssue.fields?.status?.statusCategory?.name),
        issueType: link.outwardIssue.fields?.issuetype?.name ?? 'Task',
        priority: link.outwardIssue.fields?.priority?.name ?? 'Medium',
        linkType: link.type?.outward ?? 'relates to',
        direction: 'outward'
      });
    }
  }

  const remoteLinks: JiraRemoteLink[] = (remoteLinksRaw ?? []).map((rl: any) => {
    const url = rl?.object?.url ?? '';
    return {
      id: String(rl?.id ?? ''),
      title: rl?.object?.title ?? url,
      url,
      applicationType: rl?.application?.type,
      pageId: extractConfluencePageIdFromUrl(url)
    };
  });

  const subtasks = (fields.subtasks ?? []).map((st: any) => ({
    key: st.key,
    summary: st.fields?.summary ?? '',
    status: st.fields?.status?.name ?? 'To Do',
    statusCategory: mapStatusCategory(st.fields?.status?.statusCategory?.name)
  }));

  const statusName = fields.status?.name ?? 'In Progress';
  const normalizedStatus = statusName.toLowerCase();

  return {
    id: String(raw?.id ?? ''),
    key: String(raw?.key ?? ''),
    projectKey: String(fields.project?.key ?? String(raw?.key ?? '').split('-')[0] ?? 'PROJ'),
    summary: String(fields.summary ?? ''),
    description: extractPlainTextFromAdf(fields.description),
    status: statusName,
    statusCategory: mapStatusCategory(fields.status?.statusCategory?.name),
    issueType: fields.issuetype?.name ?? 'Story',
    priority: fields.priority?.name ?? 'Medium',
    assignee: fields.assignee
      ? {
          accountId: fields.assignee.accountId,
          displayName: fields.assignee.displayName,
          email: fields.assignee.emailAddress
        }
      : undefined,
    reporter: fields.reporter
      ? {
          accountId: fields.reporter.accountId,
          displayName: fields.reporter.displayName
        }
      : undefined,
    labels,
    components: (fields.components ?? []).map((c: any) => c.name).filter(Boolean),
    fixVersions: (fields.fixVersions ?? []).map((v: any) => v.name).filter(Boolean),
    createdAt: fields.created ?? new Date().toISOString(),
    updatedAt: fields.updated ?? new Date().toISOString(),
    issueLinks,
    remoteLinks,
    subtasks,
    commentsCount: fields.comment?.total ?? 0,
    hasQaSignOff:
      lowerLabels.has('qa-approved') ||
      lowerLabels.has('qa-verified') ||
      lowerLabels.has('qa-passed') ||
      normalizedStatus.includes('ready for release') ||
      normalizedStatus.includes('done'),
    hasSecurityReview:
      lowerLabels.has('security-reviewed') ||
      lowerLabels.has('sec-approved') ||
      lowerLabels.has('appsec-approved')
  };
}

function mapIncidentSeverity(raw: any): ActiveIncidentData['severity'] {
  const priority = String(raw?.fields?.priority?.name ?? '').toLowerCase();
  const labels = (raw?.fields?.labels ?? []).map((l: string) => l.toLowerCase());
  const summary = String(raw?.fields?.summary ?? '').toLowerCase();

  if (
    priority === 'highest' ||
    priority === 'blocker' ||
    labels.includes('sev-1') ||
    labels.includes('sev1') ||
    labels.includes('p0') ||
    summary.includes('sev-1') ||
    summary.includes('sev1')
  ) {
    return 'SEV-1';
  }
  if (
    priority === 'high' ||
    labels.includes('sev-2') ||
    labels.includes('sev2') ||
    labels.includes('p1') ||
    summary.includes('sev-2') ||
    summary.includes('sev2')
  ) {
    return 'SEV-2';
  }
  if (priority === 'medium' || labels.includes('sev-3')) {
    return 'SEV-3';
  }
  return 'SEV-4';
}

export class ForgeAtlassianClient implements AtlassianDataClient {
  async getProjectName(projectKey: string): Promise<string> {
    try {
      const res = await api.asApp().requestJira(route`/rest/api/3/project/${projectKey}`, {
        headers: { Accept: 'application/json' }
      });
      if (!res.ok) return projectKey;
      const data = await res.json();
      return data?.name ?? projectKey;
    } catch {
      return projectKey;
    }
  }

  async getProjectIssueTypeNames(projectKey: string): Promise<string[]> {
    try {
      const res = await api.asApp().requestJira(route`/rest/api/3/project/${projectKey}`, {
        headers: { Accept: 'application/json' }
      });
      if (!res.ok) return ['Story', 'Task', 'Bug'];
      const data = await res.json();
      const types: string[] = (data?.issueTypes ?? [])
        .filter((t: any) => !t?.subtask && typeof t?.name === 'string')
        .map((t: any) => t.name);
      return types.length > 0 ? types : ['Story', 'Task', 'Bug'];
    } catch {
      return ['Story', 'Task', 'Bug'];
    }
  }

  async findIssuesByLabel(projectKey: string, label: string): Promise<JiraIssueData[]> {
    const cleanLabel = label.replace(/["\\]/g, '');
    const jql = `project = "${projectKey}" AND labels = "${cleanLabel}" ORDER BY created DESC`;
    try {
      const res = await api
        .asApp()
        .requestJira(
          route`/rest/api/3/search/jql?jql=${jql}&maxResults=25&fields=summary,description,status,issuetype,priority,assignee,reporter,labels,components,fixVersions,created,updated,issuelinks,subtasks,comment,project`,
          { headers: { Accept: 'application/json' } }
        );
      if (!res.ok) return [];
      const data = await res.json();
      const rawIssues: any[] = data?.issues ?? [];
      return rawIssues.map((raw) => mapJiraIssuePayload(raw, []));
    } catch {
      return [];
    }
  }

  async createJiraIssue(
    input: CreateJiraIssueInput
  ): Promise<{ id: string; key: string; url: string }> {
    const availableTypes = await this.getProjectIssueTypeNames(input.projectKey);
    const chosenType =
      input.issueTypeCandidates.find((cand) =>
        availableTypes.some((avail) => avail.toLowerCase() === cand.toLowerCase())
      ) ?? availableTypes[0] ?? 'Task';

    const buildBody = (includePriority: boolean) => {
      const fields: Record<string, any> = {
        project: { key: input.projectKey },
        summary: input.summary,
        issuetype: { name: chosenType },
        labels: input.labels ?? [],
        description: {
          version: 1,
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: input.description }]
            }
          ]
        }
      };
      if (includePriority && input.priorityName) {
        fields.priority = { name: input.priorityName };
      }
      return JSON.stringify({ fields });
    };

    let res = await api.asApp().requestJira(route`/rest/api/3/issue`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: buildBody(true)
    });

    // Some team-managed Jira projects disable the Priority field on create screens; retry cleanly without priority
    if (!res.ok && input.priorityName) {
      res = await api.asApp().requestJira(route`/rest/api/3/issue`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: buildBody(false)
      });
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to create Jira issue in ${input.projectKey} (${res.status}): ${errText}`);
    }

    const created = await res.json();
    const key = String(created.key);
    return {
      id: String(created.id),
      key,
      url: `/browse/${key}`
    };
  }

  async createJiraIssueLink(input: CreateJiraIssueLinkInput): Promise<boolean> {
    try {
      const res = await api.asApp().requestJira(route`/rest/api/3/issueLink`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: { name: input.linkTypeName ?? 'Blocks' },
          inwardIssue: { key: input.inwardIssueKey },
          outwardIssue: { key: input.outwardIssueKey }
        })
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async getJiraIssue(issueKey: string): Promise<JiraIssueData | null> {
    const issueRes = await api
      .asApp()
      .requestJira(
        route`/rest/api/3/issue/${issueKey}?fields=summary,description,status,issuetype,priority,assignee,reporter,labels,components,fixVersions,created,updated,issuelinks,subtasks,comment,project`,
        { headers: { Accept: 'application/json' } }
      );
    if (!issueRes.ok) return null;
    const rawIssue = await issueRes.json();

    let remoteLinksRaw: any[] = [];
    try {
      const rlRes = await api
        .asApp()
        .requestJira(route`/rest/api/3/issue/${issueKey}/remotelink`, {
          headers: { Accept: 'application/json' }
        });
      if (rlRes.ok) {
        const parsed = await rlRes.json();
        if (Array.isArray(parsed)) remoteLinksRaw = parsed;
      }
    } catch {
      remoteLinksRaw = [];
    }

    return mapJiraIssuePayload(rawIssue, remoteLinksRaw);
  }

  async listProjectReleaseCandidates(projectKey: string, maxResults = 25): Promise<JiraIssueData[]> {
    const jql = `project = "${projectKey}" AND statusCategory != Done ORDER BY priority DESC, updated DESC`;
    const res = await api
      .asApp()
      .requestJira(
        route`/rest/api/3/search/jql?jql=${jql}&maxResults=${maxResults}&fields=summary,description,status,issuetype,priority,assignee,reporter,labels,components,fixVersions,created,updated,issuelinks,subtasks,comment,project`,
        { headers: { Accept: 'application/json' } }
      );

    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    const rawIssues: any[] = data?.issues ?? [];

    const enriched = await Promise.all(
      rawIssues.map(async (raw) => {
        let remoteLinks: any[] = [];
        try {
          const rlRes = await api
            .asApp()
            .requestJira(route`/rest/api/3/issue/${raw.key}/remotelink`, {
              headers: { Accept: 'application/json' }
            });
          if (rlRes.ok) {
            const parsed = await rlRes.json();
            if (Array.isArray(parsed)) remoteLinks = parsed;
          }
        } catch {
          remoteLinks = [];
        }
        return mapJiraIssuePayload(raw, remoteLinks);
      })
    );

    return enriched;
  }

  async listActiveIncidents(_projectKey?: string): Promise<ActiveIncidentData[]> {
    const jql = `(issuetype = "Incident" OR issuetype = "[System] Incident" OR labels in ("sev-1", "sev-2", "sev1", "sev2", "incident")) AND statusCategory != Done ORDER BY priority DESC, created DESC`;
    try {
      const res = await api
        .asApp()
        .requestJira(
          route`/rest/api/3/search/jql?jql=${jql}&maxResults=25&fields=summary,status,priority,components,labels,assignee,created`,
          { headers: { Accept: 'application/json' } }
        );
      if (!res.ok) return [];
      const data = await res.json();
      const issues: any[] = data?.issues ?? [];

      return issues.map((raw) => {
        const comps = (raw.fields?.components ?? []).map((c: any) => c.name).filter(Boolean);
        const labels = raw.fields?.labels ?? [];
        return {
          key: raw.key,
          summary: raw.fields?.summary ?? 'Active Incident',
          severity: mapIncidentSeverity(raw),
          status: raw.fields?.status?.name ?? 'Investigating',
          components: comps,
          labels,
          affectedServices: comps,
          ownerName: raw.fields?.assignee?.displayName ?? 'On-Call Commander',
          createdAt: raw.fields?.created ?? new Date().toISOString(),
          url: `/browse/${raw.key}`
        };
      });
    } catch {
      return [];
    }
  }

  async getConfluencePage(pageId: string): Promise<ConfluencePageData | null> {
    try {
      const res = await api
        .asApp()
        .requestConfluence(route`/wiki/api/v2/pages/${pageId}?body-format=storage`, {
          headers: { Accept: 'application/json' }
        });
      if (!res.ok) return null;
      const page = await res.json();
      const webUi = page?._links?.webui ?? `/pages/${page.id}`;
      const base = page?._links?.base ?? '/wiki';

      return {
        id: String(page.id),
        title: String(page.title ?? 'Untitled Confluence Page'),
        spaceKey: String(page.spaceId ?? 'ENG'),
        spaceId: page.spaceId ? String(page.spaceId) : undefined,
        url: webUi.startsWith('http') ? webUi : `${base}${webUi}`,
        versionNumber: Number(page.version?.number ?? 1),
        updatedAt: page.version?.createdAt ?? page.createdAt ?? new Date().toISOString(),
        authorName: page.version?.authorId ?? 'Confluence Author',
        bodyText: String(page.body?.storage?.value ?? ''),
        labels: []
      };
    } catch {
      return null;
    }
  }

  async searchConfluenceRunbooks(terms: string[], limit = 3): Promise<ConfluencePageData[]> {
    const cleanTerms = terms
      .map((t) => t.replace(/["\\]/g, '').trim())
      .filter((t) => t.length >= 3)
      .slice(0, 3);
    if (cleanTerms.length === 0) return [];

    const textClauses = cleanTerms.map((t) => `text ~ "${t}"`).join(' OR ');
    const cql = `type = page AND (title ~ "runbook" OR title ~ "rollback" OR title ~ "ADR" OR label = "runbook") AND (${textClauses})`;

    try {
      const res = await api
        .asApp()
        .requestConfluence(route`/wiki/rest/api/content/search?cql=${cql}&limit=${limit}`, {
          headers: { Accept: 'application/json' }
        });
      if (!res.ok) return [];
      const data = await res.json();
      const results: any[] = data?.results ?? [];

      const pages = await Promise.all(
        results.map((r) => this.getConfluencePage(String(r.id)))
      );
      return pages.filter((p): p is ConfluencePageData => p !== null);
    } catch {
      return [];
    }
  }

  async createConfluenceRunbookPage(input: CreateRunbookPageInput): Promise<ConfluencePageData> {
    let spaceId = input.spaceId;
    if (!spaceId) {
      const spacesRes = await api
        .asApp()
        .requestConfluence(route`/wiki/api/v2/spaces?limit=10`, {
          headers: { Accept: 'application/json' }
        });
      if (spacesRes.ok) {
        const spacesData = await spacesRes.json();
        const spaces: any[] = spacesData?.results ?? [];
        const matched =
          spaces.find((s) => input.spaceKey && s.key === input.spaceKey) ?? spaces[0];
        spaceId = matched?.id ? String(matched.id) : undefined;
      }
    }

    if (!spaceId) {
      throw new Error('No accessible Confluence space found to create a rollback runbook page.');
    }

    const createRes = await api.asApp().requestConfluence(route`/wiki/api/v2/pages`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        spaceId,
        status: 'current',
        title: input.title,
        body: {
          representation: 'storage',
          value: input.storageHtml
        }
      })
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`Failed to create Confluence runbook page (${createRes.status}): ${errText}`);
    }

    const created = await createRes.json();
    const webUi = created?._links?.webui ?? `/pages/${created.id}`;
    const base = created?._links?.base ?? '/wiki';

    return {
      id: String(created.id),
      title: String(created.title ?? input.title),
      spaceKey: input.spaceKey ?? String(spaceId),
      spaceId: String(spaceId),
      url: webUi.startsWith('http') ? webUi : `${base}${webUi}`,
      versionNumber: Number(created.version?.number ?? 1),
      updatedAt: created.version?.createdAt ?? new Date().toISOString(),
      bodyText: input.storageHtml,
      labels: ['runbook', 'shipguard']
    };
  }

  async addJiraIssueComment(issueKey: string, commentText: string): Promise<{ commentId: string }> {
    const adfParagraphs = commentText.split('\n').map((line) => ({
      type: 'paragraph',
      content: line.trim() ? [{ type: 'text', text: line }] : []
    }));

    const res = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/comment`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        body: {
          version: 1,
          type: 'doc',
          content: adfParagraphs
        }
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to post comment on ${issueKey} (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return { commentId: String(data?.id ?? 'posted') };
  }

  async addJiraRemoteLink(
    issueKey: string,
    title: string,
    url: string
  ): Promise<{ linkId: string }> {
    const res = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/remotelink`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        object: {
          url,
          title
        }
      })
    });

    if (!res.ok) {
      return { linkId: 'skipped' };
    }
    const data = await res.json();
    return { linkId: String(data?.id ?? 'created') };
  }

  async getTeamworkGraphContext(
    issue: JiraIssueData,
    linkedPages: ConfluencePageData[],
    options?: { allowUserContext?: boolean }
  ): Promise<TeamworkGraphContextData> {
    const connectedContributors: TeamworkGraphContextData['connectedContributors'] = [];
    const crossProductPages = linkedPages.map((p) => ({ id: p.id, title: p.title, url: p.url }));
    const impactedServices = Array.from(
      new Set([...issue.components, ...issue.labels.filter((l) => l.includes('service') || l.includes('api'))])
    );

    if (issue.assignee) {
      connectedContributors.push({
        id: issue.assignee.accountId,
        name: issue.assignee.displayName,
        role: 'Release Assignee'
      });
    }

    // Attempt real Atlassian Teamwork Graph API curated queries in user context
    if (options?.allowUserContext !== false) {
      try {
        const probeRes = await api.asUser().requestTeamworkGraph(TWG_ECHO_PROBE_QUERY);
        if (probeRes.ok) {
          const probeBody = await probeRes.json();
          const twgHealthy = Boolean(probeBody?.data?.echo);
          let hopCount = 1;

          // Traverse assignee work graph via curated Teamwork Graph field
          if (issue.assignee?.accountId) {
            const workRes = await api
              .asUser()
              .requestTeamworkGraph(TWG_USER_ASSIGNED_WORK_QUERY, {
                userId: toAtlassianUserAri(issue.assignee.accountId)
              });
            if (workRes.ok) {
              const workBody = await workRes.json();
              const edges = workBody?.data?.atlassianUserAssignedJiraWorkItems?.edges ?? [];
              if (edges.length > 0) hopCount += 1;
            }
          }

          // Traverse linked Confluence page contributors via curated Teamwork Graph field
          for (const page of linkedPages.slice(0, 2)) {
            const contribRes = await api
              .asUser()
              .requestTeamworkGraph(TWG_PAGE_CONTRIBUTORS_QUERY, {
                pageId: page.id
              });
            if (contribRes.ok) {
              const contribBody = await contribRes.json();
              const edges = contribBody?.data?.confluencePageContributors?.edges ?? [];
              for (const edge of edges) {
                const node = edge?.node;
                if (node?.name && !connectedContributors.some((c) => c.id === node.id)) {
                  connectedContributors.push({
                    id: String(node.id),
                    name: String(node.name),
                    role: 'Runbook Contributor (Teamwork Graph)'
                  });
                }
              }
              if (edges.length > 0) hopCount += 1;
            }
          }

          if (twgHealthy) {
            return {
              source: 'TEAMWORK_GRAPH_API',
              available: true,
              note: 'Connected to Atlassian Teamwork Graph API via curated GraphQL traversal.',
              owningTeams:
                issue.components.length > 0
                  ? issue.components.slice(0, 2).map((c) => ({
                      id: `team-${c.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
                      name: `${c} Engineering`
                    }))
                  : [],
              connectedContributors,
              linkedPullRequests: extractPrSignalsFromRemoteLinks(issue.remoteLinks),
              crossProductPages,
              impactedServices,
              hopCount
            };
          }
        }
      } catch {
        // Gracefully fall back to hybrid Jira/Confluence graph synthesis
      }
    }

    return {
      source: 'HYBRID_FALLBACK',
      available: false,
      note: 'Using hybrid Jira + Confluence relationship graph (Teamwork Graph API available in interactive user context with org graph scopes enabled).',
      owningTeams:
        issue.components.length > 0
          ? issue.components.slice(0, 2).map((c) => ({
              id: `team-${c.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
              name: `${c} Engineering`
            }))
          : [],
      connectedContributors,
      linkedPullRequests: extractPrSignalsFromRemoteLinks(issue.remoteLinks),
      crossProductPages,
      impactedServices,
      hopCount: 1
    };
  }

  async getPolicy(projectKey: string): Promise<PolicyConfig | null> {
    const val = await kvs.get<PolicyConfig>(`policy:${projectKey}`);
    return val ?? null;
  }

  async savePolicy(policy: PolicyConfig): Promise<PolicyConfig> {
    await kvs.set(`policy:${policy.projectKey}`, policy);
    return policy;
  }

  async getDecisions(issueKey: string): Promise<ShipDecisionRecord[]> {
    const val = await kvs.get<ShipDecisionRecord[]>(`decisions:${issueKey}`);
    return Array.isArray(val) ? val : [];
  }

  async appendDecision(record: ShipDecisionRecord): Promise<ShipDecisionRecord[]> {
    const existing = await this.getDecisions(record.issueKey);
    const updated = [record, ...existing].slice(0, 20);
    await kvs.set(`decisions:${record.issueKey}`, updated);
    return updated;
  }

  async getDriftHistory(issueKey: string): Promise<DriftSnapshot[]> {
    const val = await kvs.get<DriftSnapshot[]>(`drift:${issueKey}`);
    return Array.isArray(val) ? val : [];
  }

  async appendDriftSnapshot(snapshot: DriftSnapshot): Promise<DriftSnapshot[]> {
    const existing = await this.getDriftHistory(snapshot.issueKey);
    const updated = [snapshot, ...existing].slice(0, 15);
    await kvs.set(`drift:${snapshot.issueKey}`, updated);
    return updated;
  }

  async getDemoSeedState(projectKey: string): Promise<DemoSeedResult | null> {
    const val = await kvs.get<DemoSeedResult>(`demo-seed:${projectKey.toUpperCase()}`);
    return val ?? null;
  }

  async saveDemoSeedState(projectKey: string, state: DemoSeedResult | null): Promise<void> {
    const key = `demo-seed:${projectKey.toUpperCase()}`;
    if (state === null) {
      await kvs.delete(key);
    } else {
      await kvs.set(key, state);
    }
  }
}

function extractPrSignalsFromRemoteLinks(
  remoteLinks: JiraRemoteLink[]
): TeamworkGraphContextData['linkedPullRequests'] {
  const prs: TeamworkGraphContextData['linkedPullRequests'] = [];
  for (const rl of remoteLinks) {
    const isPr =
      /github\.com\/.*\/pull\/\d+/i.test(rl.url) ||
      /bitbucket\.org\/.*\/pull-requests\/\d+/i.test(rl.url) ||
      /gitlab\.com\/.*\/merge_requests\/\d+/i.test(rl.url);
    if (isPr) {
      const numMatch = rl.url.match(/(\d+)\/?$/);
      prs.push({
        id: numMatch ? `PR-${numMatch[1]}` : rl.id,
        title: rl.title || 'Linked Pull Request',
        status: 'OPEN',
        reviewersApproved: 1,
        url: rl.url
      });
    }
  }
  return prs;
}
