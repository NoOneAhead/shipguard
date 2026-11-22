import { AtlassianDataClient } from '../adapters/atlassianClient';
import { ForgeAtlassianClient } from '../adapters/forgeAtlassianClient';
import { ShipGuardService } from '../services/shipGuardService';

export interface JiraUpdatedEvent {
  eventType?: string;
  issue?: {
    key?: string;
  };
}

export function createIssueTriggerHandler(
  client: AtlassianDataClient = new ForgeAtlassianClient()
) {
  const service = new ShipGuardService(client);

  return async function onJiraIssueUpdated(event: JiraUpdatedEvent) {
    const issueKey = event?.issue?.key;
    if (!issueKey) {
      return { skipped: true, reason: 'No issue key in event payload' };
    }

    const report = await service.evaluateIssue(issueKey, {
      allowUserContext: false,
      recordSnapshotEvent: event.eventType ?? 'avi:jira:updated:issue'
    });

    return {
      skipped: false,
      issueKey: report.issueKey,
      score: report.score,
      verdict: report.verdict,
      scoreDeltaSinceLastCheck: report.scoreDeltaSinceLastCheck,
      hardBlockCount: report.hardBlockReasons.length
    };
  };
}
