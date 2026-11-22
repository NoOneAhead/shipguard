import { AtlassianDataClient } from '../adapters/atlassianClient';
import { ForgeAtlassianClient } from '../adapters/forgeAtlassianClient';
import { ShipDecisionRecord } from '../core/types';
import { ShipGuardService } from '../services/shipGuardService';

function extractInput<T extends Record<string, any>>(payload: any): T {
  // Forge Rovo / MCP actions may pass inputs directly on payload or nested under payload.inputs
  if (payload && typeof payload.inputs === 'object' && payload.inputs !== null) {
    return { ...payload, ...payload.inputs } as T;
  }
  return (payload ?? {}) as T;
}

export function createRovoActionHandlers(client: AtlassianDataClient = new ForgeAtlassianClient()) {
  const service = new ShipGuardService(client);

  return {
    async evaluateShipReadinessAction(payload: any) {
      const inputs = extractInput<{ issueKey?: string }>(payload);
      const issueKey = inputs.issueKey?.trim();
      if (!issueKey) {
        return {
          ok: false as const,
          error: 'Parameter "issueKey" is required (for example: PAY-412).'
        };
      }

      const report = await service.evaluateIssue(issueKey, { allowUserContext: true });
      return {
        ok: true as const,
        issueKey: report.issueKey,
        summary: report.summary,
        score: report.score,
        verdict: report.verdict,
        blastRadiusTier: report.blastRadius.blastRadiusTier,
        hardBlockReasons: report.hardBlockReasons,
        dimensionScores: report.dimensions.map((d) => ({
          dimension: d.label,
          score: d.score,
          status: d.status,
          summary: d.summary
        })),
        topFindings: report.findings.slice(0, 6).map((f) => ({
          severity: f.severity,
          title: f.title,
          remediation: f.remediation
        })),
        incidentCollisions: report.incidentCollisions.map((c) => ({
          key: c.incident.key,
          severity: c.incident.severity,
          status: c.incident.status,
          matchedOn: c.matchedOn
        })),
        runbooks: report.runbookAudits.map((rb) => ({
          pageId: rb.pageId,
          title: rb.title,
          score: rb.score,
          status: rb.status,
          ageDays: rb.ageDays,
          missingSections: rb.missingSections
        })),
        teamworkGraphSource: report.teamworkGraph.source,
        impactedServices: report.teamworkGraph.impactedServices,
        owningTeams: report.teamworkGraph.owningTeams.map((t) => t.name),
        evaluatedAt: report.evaluatedAt
      };
    },

    async checkIncidentCollisionsAction(payload: any) {
      const inputs = extractInput<{ issueKey?: string }>(payload);
      const issueKey = inputs.issueKey?.trim();
      if (!issueKey) {
        return {
          ok: false as const,
          error: 'Parameter "issueKey" is required (for example: PAY-412).'
        };
      }

      const result = await service.checkIncidentCollisionsForIssue(issueKey);
      return {
        ok: true as const,
        ...result,
        collisions: result.collisions.map((c) => ({
          incidentKey: c.incident.key,
          severity: c.incident.severity,
          status: c.incident.status,
          owner: c.incident.ownerName,
          impactLevel: c.impactLevel,
          matchedOn: c.matchedOn,
          explanation: c.explanation
        }))
      };
    },

    async auditRunbookFreshnessAction(payload: any) {
      const inputs = extractInput<{ pageId?: string; issueKey?: string; projectKey?: string }>(
        payload
      );
      if (inputs.pageId?.trim()) {
        const result = await service.auditConfluencePage(
          inputs.pageId.trim(),
          inputs.projectKey?.trim()
        );
        return {
          ok: true as const,
          mode: 'CONFLUENCE_PAGE' as const,
          ...result
        };
      }

      if (inputs.issueKey?.trim()) {
        const report = await service.evaluateIssue(inputs.issueKey.trim(), {
          allowUserContext: true
        });
        return {
          ok: true as const,
          mode: 'JIRA_ISSUE_RUNBOOKS' as const,
          issueKey: report.issueKey,
          runbookCount: report.runbookAudits.length,
          runbooks: report.runbookAudits
        };
      }

      return {
        ok: false as const,
        error: 'Provide either "pageId" (Confluence page ID) or "issueKey" (Jira issue key).'
      };
    },

    async recordShipDecisionAction(payload: any) {
      const inputs = extractInput<{
        issueKey?: string;
        decision?: string;
        justification?: string;
        actorName?: string;
      }>(payload);

      const issueKey = inputs.issueKey?.trim();
      const decisionRaw = inputs.decision?.trim().toUpperCase();
      const justification = inputs.justification?.trim();

      if (!issueKey || !justification) {
        return {
          ok: false as const,
          error: 'Parameters "issueKey", "decision", and "justification" are required.'
        };
      }

      const validDecisions: ShipDecisionRecord['decision'][] = ['APPROVED', 'OVERRIDDEN', 'HELD'];
      const decision = validDecisions.includes(decisionRaw as ShipDecisionRecord['decision'])
        ? (decisionRaw as ShipDecisionRecord['decision'])
        : null;

      if (!decision) {
        return {
          ok: false as const,
          error: 'Parameter "decision" must be one of APPROVED, OVERRIDDEN, or HELD.'
        };
      }

      const { record, report } = await service.recordDecision({
        issueKey,
        decision,
        justification,
        actorName: inputs.actorName ?? 'Rovo / MCP Authorized Operator',
        postJiraComment: true
      });

      return {
        ok: true as const,
        decisionId: record.id,
        issueKey: record.issueKey,
        decision: record.decision,
        updatedScore: report.score,
        updatedVerdict: report.verdict,
        recordedAt: record.createdAt
      };
    },

    async getProjectReleaseRiskAction(payload: any) {
      const inputs = extractInput<{ projectKey?: string }>(payload);
      const projectKey = inputs.projectKey?.trim();
      if (!projectKey) {
        return {
          ok: false as const,
          error: 'Parameter "projectKey" is required (for example: PAY).'
        };
      }

      const summary = await service.getProjectReleaseSummary(projectKey);
      return {
        ok: true as const,
        projectKey: summary.projectKey,
        projectName: summary.projectName,
        kpis: summary.kpis,
        highestRiskCandidates: summary.candidates.slice(0, 8),
        activeIncidents: summary.activeIncidents.map((i) => ({
          key: i.key,
          severity: i.severity,
          status: i.status,
          summary: i.summary
        }))
      };
    }
  };
}
