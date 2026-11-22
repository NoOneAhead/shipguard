export const TWG_ECHO_PROBE_QUERY = `
  query ShipGuardTwgProbe {
    echo(myString: "shipguard-ok")
  }
`;

export const TWG_USER_ASSIGNED_WORK_QUERY = `
  query ShipGuardUserAssignedWork($userId: ID!) {
    atlassianUserAssignedJiraWorkItems(userId: $userId, first: 15) {
      edges {
        node {
          ... on JiraWorkItem {
            id
            title
            createdAt
          }
        }
      }
      pageInfo {
        hasNextPage
      }
    }
  }
`;

export const TWG_PAGE_CONTRIBUTORS_QUERY = `
  query ShipGuardPageContributors($pageId: ID!) {
    confluencePageContributors(pageId: $pageId, first: 15) {
      edges {
        node {
          ... on User {
            id
            name
          }
        }
      }
      pageInfo {
        hasNextPage
      }
    }
  }
`;

export function toAtlassianUserAri(accountId: string): string {
  if (accountId.startsWith('ari:')) return accountId;
  return `ari:cloud:identity::user/${accountId}`;
}

export function extractConfluencePageIdFromUrl(url: string): string | undefined {
  const pagesMatch = url.match(/\/pages\/(\d+)/i);
  if (pagesMatch) return pagesMatch[1];
  const queryMatch = url.match(/[?&]pageId=(\d+)/i);
  if (queryMatch) return queryMatch[1];
  return undefined;
}
