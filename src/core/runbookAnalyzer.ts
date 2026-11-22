import { ConfluencePageData, RunbookAuditResult, RunbookSectionCheck } from './types';

interface SectionRule {
  id: RunbookSectionCheck['id'];
  label: string;
  patterns: RegExp[];
  weight: number;
}

const SECTION_RULES: SectionRule[] = [
  {
    id: 'rollback',
    label: 'Rollback Procedure',
    patterns: [
      /\broll\s*-?\s*back\b/i,
      /\brevert\b/i,
      /\bback\s*out\b/i,
      /\bfallback\s+plan\b/i,
      /\bfeature\s+flag\s+(kill|disable|off)\b/i
    ],
    weight: 30
  },
  {
    id: 'monitoring',
    label: 'Monitoring & Alerts',
    patterns: [
      /\bmonitor(ing)?\b/i,
      /\balert(s|ing)?\b/i,
      /\bdashboard(s)?\b/i,
      /\bmetrics?\b/i,
      /\bslo\b|\bsla\b|\berror\s+rate\b|\blatency\b/i,
      /\bdatadog\b|\bgrafana\b|\bprometheus\b|\bcloudwatch\b|\bsentry\b/i
    ],
    weight: 22
  },
  {
    id: 'healthChecks',
    label: 'Health Checks & Smoke Tests',
    patterns: [
      /\bhealth\s*-?\s*check/i,
      /\bsmoke\s+test/i,
      /\bcanary\b/i,
      /\bsynthetic\s+check/i,
      /\bstatus\s+endpoint\b|\/healthz|\/readyz/i
    ],
    weight: 18
  },
  {
    id: 'escalation',
    label: 'On-Call Owner & Escalation',
    patterns: [
      /\bescalat(e|ion)\b/i,
      /\bon\s*-?\s*call\b/i,
      /\bowner(ship)?\b/i,
      /\bpagerduty\b|\bopsgenie\b|\bincident\s+commander\b/i,
      /\bslack\s+channel\b|#inc-|#ops-|#sre/i
    ],
    weight: 15
  },
  {
    id: 'verification',
    label: 'Post-Deploy Verification Steps',
    patterns: [
      /\bverif(y|ication)\b/i,
      /\bpost\s*-?\s*deploy/i,
      /\bvalidation\s+steps?\b/i,
      /\bacceptance\s+check/i,
      /\bcutover\b|\bmigration\s+check/i
    ],
    weight: 15
  }
];

export function stripHtmlToPlainText(input: string): string {
  return input
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function analyzeRunbookPage(
  page: ConfluencePageData,
  freshnessSlaDays: number,
  now: Date = new Date()
): RunbookAuditResult {
  const plainText = `${page.title}\n${stripHtmlToPlainText(page.bodyText)}`;
  const updatedMs = Date.parse(page.updatedAt);
  const ageDays = Number.isFinite(updatedMs)
    ? Math.max(0, Math.floor((now.getTime() - updatedMs) / (1000 * 60 * 60 * 24)))
    : freshnessSlaDays + 1;

  const isStale = ageDays > freshnessSlaDays;

  let sectionScore = 0;
  const sections: RunbookSectionCheck[] = SECTION_RULES.map((rule) => {
    const matchedTerms: string[] = [];
    for (const pattern of rule.patterns) {
      const match = plainText.match(pattern);
      if (match) {
        matchedTerms.push(match[0]);
      }
    }
    const present = matchedTerms.length > 0;
    if (present) {
      sectionScore += rule.weight;
    }
    return {
      id: rule.id,
      label: rule.label,
      present,
      matchedTerms: Array.from(new Set(matchedTerms)).slice(0, 4)
    };
  });

  // Penalize stale runbooks proportionally beyond SLA (up to 35 points)
  let freshnessPenalty = 0;
  if (isStale) {
    const overdueDays = ageDays - freshnessSlaDays;
    freshnessPenalty = Math.min(35, 12 + Math.floor(overdueDays / 10) * 4);
  }

  // Bonus / penalty for very short stub documents (<120 chars of body text)
  const bodyLength = stripHtmlToPlainText(page.bodyText).length;
  const stubPenalty = bodyLength < 120 ? 15 : 0;

  const score = Math.max(0, Math.min(100, sectionScore - freshnessPenalty - stubPenalty));
  const missingSections = sections.filter((s) => !s.present).map((s) => s.label);

  const recommendations: string[] = [];
  if (missingSections.includes('Rollback Procedure')) {
    recommendations.push(
      'Add an explicit Rollback Procedure with commands, feature-flag kill switches, and database revert safety notes.'
    );
  }
  if (missingSections.includes('Monitoring & Alerts')) {
    recommendations.push(
      'Document key SLO metrics, error-rate dashboards, and alert thresholds to watch for 30 minutes post-deploy.'
    );
  }
  if (missingSections.includes('Health Checks & Smoke Tests')) {
    recommendations.push(
      'Include post-release smoke tests or /healthz endpoints to verify service health before widening rollout.'
    );
  }
  if (missingSections.includes('On-Call Owner & Escalation')) {
    recommendations.push(
      'Specify the primary on-call owner, Opsgenie/PagerDuty schedule, and escalation channel.'
    );
  }
  if (missingSections.includes('Post-Deploy Verification Steps')) {
    recommendations.push(
      'Add concrete post-deploy verification steps so release operators know when to declare the deploy complete.'
    );
  }
  if (isStale) {
    recommendations.push(
      `Refresh this runbook — last updated ${ageDays} days ago, exceeding the ${freshnessSlaDays}-day freshness SLA.`
    );
  }
  if (bodyLength < 120) {
    recommendations.push('Expand this runbook stub with concrete operational steps before shipping.');
  }

  let status: RunbookAuditResult['status'] = 'HEALTHY';
  if (score < 55 || missingSections.includes('Rollback Procedure')) {
    status = 'STALE_OR_INCOMPLETE';
  } else if (score < 80 || isStale || missingSections.length > 0) {
    status = 'NEEDS_ATTENTION';
  }

  return {
    pageId: page.id,
    title: page.title,
    spaceKey: page.spaceKey,
    url: page.url,
    score,
    status,
    ageDays,
    freshnessSlaDays,
    isStale,
    updatedAt: page.updatedAt,
    sections,
    missingSections,
    recommendations
  };
}

export function buildRollbackRunbookStorageHtml(params: {
  issueKey: string;
  issueSummary: string;
  components: string[];
  ownerName: string;
  fixVersions: string[];
}): string {
  const esc = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const componentList =
    params.components.length > 0 ? esc(params.components.join(', ')) : 'Core Service';
  const releaseTag =
    params.fixVersions.length > 0 ? esc(params.fixVersions.join(', ')) : 'Upcoming Release';

  return [
    `<p><strong>Generated by ShipGuard Release Guardian</strong> for Jira issue <code>${esc(params.issueKey)}</code> (${esc(params.issueSummary)}).</p>`,
    `<table><tbody>`,
    `<tr><th>Release / Version</th><td>${releaseTag}</td></tr>`,
    `<tr><th>Components / Services</th><td>${componentList}</td></tr>`,
    `<tr><th>Primary On-Call Owner</th><td>${esc(params.ownerName)}</td></tr>`,
    `</tbody></table>`,
    `<h2>1. Rollback Procedure</h2>`,
    `<ol>`,
    `<li>Disable the release feature flag or kill switch immediately if error rate exceeds 1.0% for 5 minutes.</li>`,
    `<li>Revert deployment artifact to the last known-good build tag and confirm pod rollout completion.</li>`,
    `<li>Verify backwards-compatible schema state before re-enabling traffic.</li>`,
    `</ol>`,
    `<h2>2. Monitoring &amp; Alerts</h2>`,
    `<ul>`,
    `<li>Watch P95 latency, HTTP 5xx error rate, and queue depth dashboards for 30 minutes post-deploy.</li>`,
    `<li>Confirm automated SLO burn-rate alerts are active and routing to on-call.</li>`,
    `</ul>`,
    `<h2>3. Health Checks &amp; Smoke Tests</h2>`,
    `<ul>`,
    `<li>Verify <code>/healthz</code> and <code>/readyz</code> return HTTP 200 across all regions.</li>`,
    `<li>Run golden-path synthetic smoke test against staging and canary traffic.</li>`,
    `</ul>`,
    `<h2>4. Post-Deploy Verification Steps</h2>`,
    `<ul>`,
    `<li>Confirm zero regression in core transaction metrics after 100% traffic cutover.</li>`,
    `<li>Record release verification timestamp on Jira issue <code>${esc(params.issueKey)}</code>.</li>`,
    `</ul>`,
    `<h2>5. Escalation &amp; Incident Contacts</h2>`,
    `<p>Primary Owner: ${esc(params.ownerName)} | Escalation Channel: <code>#ops-release-warroom</code> | On-Call Rotation: Primary Platform SRE.</p>`
  ].join('\n');
}
