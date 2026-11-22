import { describe, expect, it } from 'vitest';
import { MockAtlassianClient } from '../src/adapters/mockAtlassianClient';
import { createIssueTriggerHandler } from '../src/handlers/issueTrigger';

describe('avi:jira:updated:issue drift trigger', () => {
  it('evaluates updated issue and appends a drift snapshot to Forge KVS', async () => {
    const client = new MockAtlassianClient();
    const handler = createIssueTriggerHandler(client);

    const beforeHistory = await client.getDriftHistory('PAY-425');
    expect(beforeHistory).toHaveLength(0);

    const res = await handler({
      eventType: 'avi:jira:updated:issue',
      issue: { key: 'PAY-425' }
    });

    expect(res.skipped).toBe(false);
    expect(res.issueKey).toBe('PAY-425');
    expect(res.verdict).toBe('GO');

    const afterHistory = await client.getDriftHistory('PAY-425');
    expect(afterHistory).toHaveLength(1);
    expect(afterHistory[0].triggerEvent).toBe('avi:jira:updated:issue');
  });

  it('skips cleanly when event has no issue key', async () => {
    const handler = createIssueTriggerHandler(new MockAtlassianClient());
    const res = await handler({});
    expect(res.skipped).toBe(true);
  });
});
