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

export interface CreateRunbookPageInput {
  spaceKey?: string;
  spaceId?: string;
  title: string;
  storageHtml: string;
}

export interface CreateJiraIssueInput {
  projectKey: string;
  summary: string;
  description: string;
  issueTypeCandidates: string[];
  priorityName?: string;
  labels?: string[];
  components?: string[];
}

export interface CreateJiraIssueLinkInput {
  inwardIssueKey: string;
  outwardIssueKey: string;
  linkTypeName?: string;
}

export interface AtlassianDataClient {
  getProjectName(projectKey: string): Promise<string>;
  getProjectIssueTypeNames(projectKey: string): Promise<string[]>;
  getJiraIssue(issueKey: string): Promise<JiraIssueData | null>;
  findIssuesByLabel(projectKey: string, label: string): Promise<JiraIssueData[]>;
  listProjectReleaseCandidates(projectKey: string, maxResults?: number): Promise<JiraIssueData[]>;
  listActiveIncidents(projectKey?: string): Promise<ActiveIncidentData[]>;
  createJiraIssue(input: CreateJiraIssueInput): Promise<{ id: string; key: string; url: string }>;
  createJiraIssueLink(input: CreateJiraIssueLinkInput): Promise<boolean>;
  getConfluencePage(pageId: string): Promise<ConfluencePageData | null>;
  searchConfluenceRunbooks(terms: string[], limit?: number): Promise<ConfluencePageData[]>;
  createConfluenceRunbookPage(input: CreateRunbookPageInput): Promise<ConfluencePageData>;
  addJiraIssueComment(issueKey: string, commentText: string): Promise<{ commentId: string }>;
  addJiraRemoteLink(issueKey: string, title: string, url: string): Promise<{ linkId: string }>;
  getTeamworkGraphContext(
    issue: JiraIssueData,
    linkedPages: ConfluencePageData[],
    options?: { allowUserContext?: boolean }
  ): Promise<TeamworkGraphContextData>;
  getPolicy(projectKey: string): Promise<PolicyConfig | null>;
  savePolicy(policy: PolicyConfig): Promise<PolicyConfig>;
  getDecisions(issueKey: string): Promise<ShipDecisionRecord[]>;
  appendDecision(record: ShipDecisionRecord): Promise<ShipDecisionRecord[]>;
  getDriftHistory(issueKey: string): Promise<DriftSnapshot[]>;
  appendDriftSnapshot(snapshot: DriftSnapshot): Promise<DriftSnapshot[]>;
  getDemoSeedState(projectKey: string): Promise<DemoSeedResult | null>;
  saveDemoSeedState(projectKey: string, state: DemoSeedResult | null): Promise<void>;
}
