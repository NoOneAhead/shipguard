import React, { useCallback, useEffect, useState } from 'react';
import { invokeBackend } from '../bridge';
import { ConfluenceAuditResponse } from '../types';
import { ReadinessGauge } from './ReadinessGauge';

interface ConfluenceVerifierViewProps {
  pageId: string;
  projectKey: string;
  onInspectIssue?: (issueKey: string) => void;
}

export const ConfluenceVerifierView: React.FC<ConfluenceVerifierViewProps> = ({
  pageId,
  projectKey,
  onInspectIssue
}) => {
  const [data, setData] = useState<ConfluenceAuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAudit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await invokeBackend<ConfluenceAuditResponse>('auditConfluenceRunbook', {
        pageId,
        projectKey
      });
      setData(res);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to audit Confluence runbook page.');
    } finally {
      setLoading(false);
    }
  }, [pageId, projectKey]);

  useEffect(() => {
    loadAudit();
  }, [loadAudit]);

  if (loading && !data) {
    return (
      <div className="sg-card">
        <div className="empty-state">Auditing Confluence page {pageId} against ShipGuard production runbook criteria...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="sg-alert sg-alert-block">
        <div className="sg-alert-title">Runbook Verification Failed</div>
        <div>{error ?? 'Confluence page not found.'}</div>
      </div>
    );
  }

  const { audit, relatedIssues } = data;
  const verdict =
    audit.status === 'HEALTHY'
      ? 'GO'
      : audit.status === 'NEEDS_ATTENTION'
        ? 'CAUTION'
        : 'BLOCK';

  return (
    <div>
      <div className="sg-card">
        <div className="hero-grid">
          <ReadinessGauge score={audit.score} verdict={verdict} />
          <div>
            <div className="issue-meta-row">
              <span className="issue-key-chip">{audit.pageId}</span>
              <span className="sg-badge badge-neutral">Space: {audit.spaceKey}</span>
              <span className={`sg-badge ${audit.isStale ? 'badge-block' : 'badge-go'}`}>
                {audit.isStale
                  ? `STALE: ${audit.ageDays}d > ${audit.freshnessSlaDays}d SLA`
                  : `FRESH: ${audit.ageDays}d / ${audit.freshnessSlaDays}d SLA`}
              </span>
            </div>

            <h2 className="issue-heading">{audit.title}</h2>
            <p className="sg-card-subtitle" style={{ marginBottom: 12 }}>
              ShipGuard Confluence Runbook Verifier checks every linked ADR or deployment guide for rollback safety, monitoring alerts, health checks, on-call ownership, and post-deploy verification.
            </p>

            <button className="sg-btn sg-btn-primary" onClick={loadAudit} disabled={loading}>
              Re-Verify Runbook
            </button>
          </div>
        </div>
      </div>

      <div className="sg-card">
        <div className="sg-card-header">
          <div>
            <h3 className="sg-card-title">5-Point Operational Runbook Checklist</h3>
            <p className="sg-card-subtitle">Required production readiness sections verified deterministically from Confluence Storage Format.</p>
          </div>
        </div>

        {audit.sections.map((sec) => (
          <div key={sec.id} className="checklist-row">
            <div>
              <div className="finding-title">{sec.label}</div>
              <div style={{ fontSize: 12, color: '#6b778c' }}>
                {sec.present
                  ? `Matched evidence: ${sec.matchedTerms.join(', ')}`
                  : 'Not detected in page content — required for production rollback readiness.'}
              </div>
            </div>
            <span className={`sg-badge ${sec.present ? 'badge-go' : 'badge-block'}`}>
              {sec.present ? 'PRESENT' : 'MISSING'}
            </span>
          </div>
        ))}
      </div>

      {audit.recommendations.length > 0 && (
        <div className="sg-card">
          <div className="sg-card-header">
            <h3 className="sg-card-title">Recommended Updates Before Next Release</h3>
          </div>
          <ul className="sg-alert-list" style={{ color: '#172b4d', fontSize: 13 }}>
            {audit.recommendations.map((rec, idx) => (
              <li key={idx} style={{ marginBottom: 6 }}>
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="sg-card">
        <div className="sg-card-header">
          <div>
            <h3 className="sg-card-title">Linked Jira Release Candidates ({relatedIssues.length})</h3>
            <p className="sg-card-subtitle">Active Jira issues referencing this Confluence runbook.</p>
          </div>
        </div>
        {relatedIssues.length === 0 ? (
          <div className="empty-state">No open Jira issues in project {projectKey} currently link to this page.</div>
        ) : (
          relatedIssues.map((iss) => (
            <div key={iss.issueKey} className="checklist-row">
              <div>
                <strong style={{ fontFamily: 'var(--sg-mono)', color: '#0052cc' }}>{iss.issueKey}</strong>{' '}
                — {iss.summary}{' '}
                <span className="sg-badge badge-neutral" style={{ marginLeft: 6 }}>
                  {iss.status}
                </span>
              </div>
              {onInspectIssue && (
                <button className="sg-btn" onClick={() => onInspectIssue(iss.issueKey)}>
                  Inspect Readiness →
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
