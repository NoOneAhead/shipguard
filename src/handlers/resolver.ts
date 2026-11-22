import Resolver from '@forge/resolver';
import { AtlassianDataClient } from '../adapters/atlassianClient';
import { ForgeAtlassianClient } from '../adapters/forgeAtlassianClient';
import { PolicyConfig, ShipDecisionRecord } from '../core/types';
import { ShipGuardService } from '../services/shipGuardService';

export interface ResolverContextLike {
  extension?: {
    issue?: { key?: string };
    project?: { key?: string };
    content?: { id?: string };
    type?: string;
  };
  accountId?: string;
}

export function createResolverHandlers(client: AtlassianDataClient) {
  const service = new ShipGuardService(client);

  return {
    async evaluateIssueReadiness(req: {
      payload?: { issueKey?: string };
      context?: ResolverContextLike;
    }) {
      const issueKey = req.payload?.issueKey ?? req.context?.extension?.issue?.key;
      if (!issueKey) {
        throw new Error('Missing issueKey in request payload or Jira issue context.');
      }
      return service.evaluateIssue(issueKey, { allowUserContext: true });
    },

    async getProjectReleaseSummary(req: {
      payload?: { projectKey?: string };
      context?: ResolverContextLike;
    }) {
      const projectKey =
        req.payload?.projectKey ??
        req.context?.extension?.project?.key ??
        req.context?.extension?.issue?.key?.split('-')[0];
      if (!projectKey) {
        throw new Error('Missing projectKey in request payload or Jira project context.');
      }
      return service.getProjectReleaseSummary(projectKey);
    },

    async auditConfluenceRunbook(req: {
      payload?: { pageId?: string; projectKey?: string };
      context?: ResolverContextLike;
    }) {
      const pageId = req.payload?.pageId ?? req.context?.extension?.content?.id;
      if (!pageId) {
        throw new Error('Missing pageId in request payload or Confluence page context.');
      }
      return service.auditConfluencePage(String(pageId), req.payload?.projectKey);
    },

    async postAuditComment(req: {
      payload?: { issueKey?: string };
      context?: ResolverContextLike;
    }) {
      const issueKey = req.payload?.issueKey ?? req.context?.extension?.issue?.key;
      if (!issueKey) {
        throw new Error('Missing issueKey to post readiness audit comment.');
      }
      return service.postReadinessAuditComment(issueKey);
    },

    async createRollbackRunbookStub(req: {
      payload?: { issueKey?: string; spaceKey?: string };
      context?: ResolverContextLike;
    }) {
      const issueKey = req.payload?.issueKey ?? req.context?.extension?.issue?.key;
      if (!issueKey) {
        throw new Error('Missing issueKey to generate rollback runbook stub.');
      }
      return service.createRollbackRunbookStub(issueKey, req.payload?.spaceKey);
    },

    async recordShipDecision(req: {
      payload?: {
        issueKey?: string;
        decision: ShipDecisionRecord['decision'];
        justification: string;
        actorName?: string;
        postJiraComment?: boolean;
      };
      context?: ResolverContextLike;
    }) {
      const issueKey = req.payload?.issueKey ?? req.context?.extension?.issue?.key;
      if (!issueKey || !req.payload?.decision || !req.payload?.justification) {
        throw new Error('issueKey, decision, and justification are required.');
      }
      return service.recordDecision({
        issueKey,
        decision: req.payload.decision,
        justification: req.payload.justification,
        actorName: req.payload.actorName,
        postJiraComment: req.payload.postJiraComment
      });
    },

    async updateProjectPolicy(req: {
      payload?: { projectKey?: string; updates: Partial<PolicyConfig>; actorName?: string };
      context?: ResolverContextLike;
    }) {
      const projectKey = req.payload?.projectKey ?? req.context?.extension?.project?.key;
      if (!projectKey || !req.payload?.updates) {
        throw new Error('projectKey and updates are required to update team policy.');
      }
      return service.updateProjectPolicy(projectKey, req.payload.updates, req.payload.actorName);
    },

    async seedDemoScenario(req: {
      payload?: { projectKey?: string; spaceKey?: string; force?: boolean };
      context?: ResolverContextLike;
    }) {
      const projectKey =
        req.payload?.projectKey ??
        req.context?.extension?.project?.key ??
        req.context?.extension?.issue?.key?.split('-')[0];
      if (!projectKey) {
        throw new Error('Missing projectKey to seed ShipGuard demo scenario.');
      }
      return service.seedDemoScenario(projectKey, {
        spaceKey: req.payload?.spaceKey,
        force: req.payload?.force
      });
    }
  };
}

export function buildForgeResolver(client: AtlassianDataClient = new ForgeAtlassianClient()) {
  const resolver = new Resolver();
  const handlers = createResolverHandlers(client);

  resolver.define('evaluateIssueReadiness', handlers.evaluateIssueReadiness);
  resolver.define('getProjectReleaseSummary', handlers.getProjectReleaseSummary);
  resolver.define('auditConfluenceRunbook', handlers.auditConfluenceRunbook);
  resolver.define('postAuditComment', handlers.postAuditComment);
  resolver.define('createRollbackRunbookStub', handlers.createRollbackRunbookStub);
  resolver.define('recordShipDecision', handlers.recordShipDecision);
  resolver.define('updateProjectPolicy', handlers.updateProjectPolicy);
  resolver.define('seedDemoScenario', handlers.seedDemoScenario);

  return resolver.getDefinitions();
}
