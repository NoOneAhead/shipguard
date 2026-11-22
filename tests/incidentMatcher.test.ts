import { describe, expect, it } from 'vitest';
import { detectIncidentCollisions } from '../src/core/incidentMatcher';
import { ActiveIncidentData, JiraIssueData, TeamworkGraphContextData } from '../src/core/types';

const baseIssue: JiraIssueData = {
  id: '1',
  key: 'PAY-412',
  projectKey: 'PAY',
  summary: 'Rotate HMAC signing secrets in checkout-webhooks',
  description: 'Updates signature verification middleware for merchant callbacks.',
  status: 'In Review',
  statusCategory: 'In Progress',
  issueType: 'Story',
  priority: 'Highest',
  labels: ['payments', 'webhooks'],
  components: ['checkout-webhooks'],
  fixVersions: ['v2026.12.1'],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  issueLinks: [],
  remoteLinks: [],
  subtasks: [],
  commentsCount: 0
};

const baseGraph: TeamworkGraphContextData = {
  source: 'TEAMWORK_GRAPH_API',
  available: true,
  owningTeams: [],
  connectedContributors: [],
  linkedPullRequests: [],
  crossProductPages: [],
  impactedServices: ['checkout-webhooks', 'payment-gateway'],
  hopCount: 2
};

describe('incidentMatcher', () => {
  it('flags active SEV-1 component/service overlap as CRITICAL', () => {
    const incidents: ActiveIncidentData[] = [
      {
        key: 'INC-889',
        summary: 'SEV-1 signature failure on checkout-webhooks',
        severity: 'SEV-1',
        status: 'Investigating',
        components: ['checkout-webhooks'],
        labels: ['sev-1', 'webhooks'],
        affectedServices: ['checkout-webhooks'],
        ownerName: 'Devon Brooks',
        createdAt: new Date().toISOString(),
        url: '/browse/INC-889'
      }
    ];

    const collisions = detectIncidentCollisions(baseIssue, incidents, baseGraph);
    expect(collisions).toHaveLength(1);
    expect(collisions[0].impactLevel).toBe('CRITICAL');
    expect(collisions[0].matchedOn).toContain('component:checkout-webhooks');
  });

  it('ignores resolved or closed incidents', () => {
    const incidents: ActiveIncidentData[] = [
      {
        key: 'INC-700',
        summary: 'Old resolved incident on checkout-webhooks',
        severity: 'SEV-1',
        status: 'Resolved',
        components: ['checkout-webhooks'],
        labels: ['webhooks'],
        affectedServices: ['checkout-webhooks'],
        ownerName: 'SRE',
        createdAt: new Date().toISOString(),
        url: '/browse/INC-700'
      }
    ];
    expect(detectIncidentCollisions(baseIssue, incidents, baseGraph)).toHaveLength(0);
  });

  it('sorts CRITICAL collisions ahead of HIGH and MEDIUM collisions', () => {
    const incidents: ActiveIncidentData[] = [
      {
        key: 'INC-2',
        summary: 'SEV-2 gateway spike',
        severity: 'SEV-2',
        status: 'Mitigating',
        components: [],
        labels: [],
        affectedServices: ['payment-gateway'],
        ownerName: 'Ops 2',
        createdAt: new Date().toISOString(),
        url: '/browse/INC-2'
      },
      {
        key: 'INC-1',
        summary: 'SEV-1 webhooks outage',
        severity: 'SEV-1',
        status: 'Investigating',
        components: ['checkout-webhooks'],
        labels: ['payments'],
        affectedServices: ['checkout-webhooks'],
        ownerName: 'Ops 1',
        createdAt: new Date().toISOString(),
        url: '/browse/INC-1'
      }
    ];
    const collisions = detectIncidentCollisions(baseIssue, incidents, baseGraph);
    expect(collisions.map((c) => c.incident.key)).toEqual(['INC-1', 'INC-2']);
    expect(collisions[0].impactLevel).toBe('CRITICAL');
    expect(collisions[1].impactLevel).toBe('HIGH');
  });
});
