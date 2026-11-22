import { buildForgeResolver } from './handlers/resolver';
import { createRovoActionHandlers } from './handlers/rovoActions';
import { createIssueTriggerHandler } from './handlers/issueTrigger';

export const resolverHandler = buildForgeResolver();

const rovoHandlers = createRovoActionHandlers();

export const evaluateShipReadinessAction = rovoHandlers.evaluateShipReadinessAction;
export const checkIncidentCollisionsAction = rovoHandlers.checkIncidentCollisionsAction;
export const auditRunbookFreshnessAction = rovoHandlers.auditRunbookFreshnessAction;
export const recordShipDecisionAction = rovoHandlers.recordShipDecisionAction;
export const getProjectReleaseRiskAction = rovoHandlers.getProjectReleaseRiskAction;

export const onJiraIssueUpdated = createIssueTriggerHandler();
