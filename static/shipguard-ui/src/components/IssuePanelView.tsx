import React, { useCallback, useEffect, useState } from 'react';
import { invokeBackend } from '../bridge';
import { ShipDecisionRecord, ShipReadinessReport } from '../types';
import { BlastRadiusMap } from './BlastRadiusMap';
import { ReadinessGauge } from './ReadinessGauge';
import { RiskDimensionCards } from './RiskDimensionCards';

interface IssuePanelViewProps {
  issueKey: string;
  onNavigateProject?: () => void;
  onOpenRunbook?: (pageId: string) => void;
}

type IssueTab = 'overview' | 'blast' | 'runbooks' | 'governance';

export const IssuePanelView: React.FC<IssuePanelViewProps> = ({
  issueKey,
  onNavigateProject,
  onOpenRunbook
}) => {
  const [report, setReport] = useState<ShipReadinessReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<IssueTab>('overview');

  // Override / Governance Modal State
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [decisionType, setDecisionType] = useState<ShipDecisionRecord['decision']>('OVERRIDDEN');
  const [justification, setJustification] = useState('');
  const [actorName, setActorName] = useState('Alex Rivera (Release Lead)');

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await invokeBackend<ShipReadinessReport>('evaluateIssueReadiness', {
        issueKey
      });
      setReport(data);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to evaluate ship readiness.');
    } finally {
      setLoading(false);
    }
  }, [issueKey]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const handlePostAudit = async () => {
    setBusyAction('comment');
    try {
      const res = await invokeBackend<{ commentId: string; report: ShipReadinessReport }>(
        'postAuditComment',
        { issueKey }
      );
      setReport(res.report);
      setToast(`Posted structured ShipGuard readiness audit comment (${res.commentId}) to ${issueKey}.`);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to post Jira audit comment.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleGenerateRunbook = async () => {
    setBusyAction('runbook');
    try {
      const res = await invokeBackend<{
        page: { id: string; title: string; url: string };
        report: ShipReadinessReport;
      }>('createRollbackRunbookStub', { issueKey });
      setReport(res.report);
      setToast(
        `Created Confluence Rollback Runbook "${res.page.title}" (${res.page.id}), linked it to ${issueKey}, and recalculated readiness (${res.report.score}/100)!`
      );
    } catch (err: any) {
      setError(err?.message ?? 'Failed to generate Confluence runbook stub.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleSubmitDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (justification.trim().length < 8) {
      setError('Please enter at least 8 characters of audit justification.');
      return;
    }
    setBusyAction('decision');
    setError(null);
    try {
      const res = await invokeBackend<{
        record: ShipDecisionRecord;
        report: ShipReadinessReport;
      }>('recordShipDecision', {
        issueKey,
        decision: decisionType,
        justification,
        actorName,
        postJiraComment: true
      });
      setReport(res.report);
      setShowDecisionModal(false);
      setJustification('');
      setToast(
        `Recorded ${res.record.decision} governance decision in Forge KVS and posted audit trail to ${issueKey}.`
      );
    } catch (err: any) {
      setError(err?.message ?? 'Failed to record ship decision.');
    } finally {
      setBusyAction(null);
    }
  };

  if (loading && !report) {
    return (
      <div className="sg-card">
        <div className="empty-state">Evaluating live Jira, Confluence, Incident &amp; Teamwork Graph signals for {issueKey}...</div>
      </div>
    );
  }

  if (error && !report) {
    return (
      <div className="sg-alert sg-alert-block">
        <div className="sg-alert-title">Could not evaluate {issueKey}</div>
        <div>{error}</div>
      </div>
    );
  }

  if (!report) return null;

  return (
    <div>
      {toast && (
        <div className="toast-banner" role="status">
          <span>{toast}</span>
          <button className="toast-close" onClick={() => setToast(null)} aria-label="Dismiss notification">
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="sg-alert sg-alert-block" style={{ marginBottom: 12 }}>
          <div className="sg-alert-title">Action Notice</div>
          <div>{error}</div>
        </div>
      )}

      {/* Hero Summary Card */}
      <div className="sg-card">
        <div className="hero-grid">
          <ReadinessGauge
            score={report.score}
            verdict={report.verdict}
            blastRadiusTier={report.blastRadius.blastRadiusTier}
            scoreDelta={report.scoreDeltaSinceLastCheck}
          />

          <div>
            <div className="issue-meta-row">
              <span className="issue-key-chip">{report.issueKey}</span>
              <span className="sg-badge badge-neutral">{report.status}</span>
              <span className="sg-badge badge-low">Priority: {report.priority}</span>
              <span className="sg-badge badge-purple">
                {report.teamworkGraph.source === 'TEAMWORK_GRAPH_API'
                  ? `Teamwork Graph (${report.teamworkGraph.hopCount} hops)`
                  : 'Hybrid Context Graph'}
              </span>
              {report.latestDecision && (
                <span className="sg-badge badge-caution">
                  Decision: {report.latestDecision.decision}
                </span>
              )}
            </div>

            <h2 className="issue-heading">{report.summary}</h2>

            <div className="meta-kv-row">
              <span><strong>Owner:</strong> {report.assigneeName}</span>
              <span>
                <strong>Components:</strong>{' '}
                {report.components.length > 0 ? report.components.join(', ') : 'None'}
              </span>
              <span>
                <strong>Release:</strong>{' '}
                {report.fixVersions.length > 0 ? report.fixVersions.join(', ') : 'Unscheduled'}
              </span>
              <span>
                <strong>Blast Radius:</strong> {report.blastRadius.affectedCount} linked entities
              </span>
            </div>

            <div className="action-toolbar">
              <button
                className="sg-btn sg-btn-primary"
                onClick={handlePostAudit}
                disabled={busyAction !== null}
              >
                {busyAction === 'comment' ? 'Posting...' : 'Post Readiness Audit to Jira'}
              </button>
              <button
                className="sg-btn"
                onClick={handleGenerateRunbook}
                disabled={busyAction !== null}
              >
                {busyAction === 'runbook' ? 'Generating...' : 'Generate Rollback Runbook Stub'}
              </button>
              <button
                className="sg-btn"
                onClick={() => setShowDecisionModal(true)}
                disabled={busyAction !== null}
              >
                Record Decision / Override
              </button>
              <button
                className="sg-btn sg-btn-subtle"
                onClick={loadReport}
                disabled={loading || busyAction !== null}
              >
                Re-Evaluate
              </button>
              {onNavigateProject && (
                <button className="sg-btn sg-btn-subtle" onClick={onNavigateProject}>
                  Open Release Center →
                </button>
              )}
            </div>
          </div>
        </div>

        {report.hardBlockReasons.length > 0 && (
          <div className="sg-alert sg-alert-block">
            <div className="sg-alert-title">
              Hard Ship-Gate Blockers Triggered ({report.hardBlockReasons.length})
            </div>
            <ul className="sg-alert-list">
              {report.hardBlockReasons.map((reason, idx) => (
                <li key={idx}>{reason}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Sub-navigation Tabs */}
      <div className="sg-tabs" role="tablist">
        <button
          className={`sg-tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
          role="tab"
        >
          Overview &amp; Risk Findings <span className="sg-tab-count">{report.findings.length}</span>
        </button>
        <button
          className={`sg-tab ${activeTab === 'blast' ? 'active' : ''}`}
          onClick={() => setActiveTab('blast')}
          role="tab"
        >
          Blast-Radius Map <span className="sg-tab-count">{report.blastRadius.nodes.length}</span>
        </button>
        <button
          className={`sg-tab ${activeTab === 'runbooks' ? 'active' : ''}`}
          onClick={() => setActiveTab('runbooks')}
          role="tab"
        >
          Runbooks &amp; Incidents{' '}
          <span className="sg-tab-count">
            {report.runbookAudits.length + report.incidentCollisions.length}
          </span>
        </button>
        <button
          className={`sg-tab ${activeTab === 'governance' ? 'active' : ''}`}
          onClick={() => setActiveTab('governance')}
          role="tab"
        >
          Governance &amp; Drift{' '}
          <span className="sg-tab-count">
            {report.decisionHistory.length + report.driftHistory.length}
          </span>
        </button>
      </div>

      {/* Tab 1: Overview & Risk Findings */}
      {activeTab === 'overview' && (
        <>
          <div className="sg-card">
            <div className="sg-card-header">
              <div>
                <h3 className="sg-card-title">5-Dimension Release Readiness Breakdown</h3>
                <p className="sg-card-subtitle">
                  Deterministic weighted score computed live across Jira, Confluence, JSM Incidents, Teamwork Graph, and KVS Drift History.
                </p>
              </div>
              <span className="sg-badge badge-neutral">
                GO ≥ {report.policyApplied.goThreshold} · CAUTION ≥ {report.policyApplied.cautionThreshold}
              </span>
            </div>
            <RiskDimensionCards dimensions={report.dimensions} />
          </div>

          <div className="sg-card">
            <div className="sg-card-header">
              <div>
                <h3 className="sg-card-title">Prioritized Risk Findings &amp; Remediation</h3>
                <p className="sg-card-subtitle">Ordered by severity so engineers can clear blockers before merging or cutting a release.</p>
              </div>
            </div>
            {report.findings.length === 0 ? (
              <div className="sg-alert sg-alert-success">
                <div className="sg-alert-title">All ShipGuard Release Gates Clear</div>
                <div>No blockers, active incident collisions, or runbook gaps were found for {report.issueKey}.</div>
              </div>
            ) : (
              <div className="finding-list">
                {report.findings.map((finding) => (
                  <div key={finding.id} className={`finding-item sev-${finding.severity}`}>
                    <div className="finding-header">
                      <span className="finding-title">{finding.title}</span>
                      <span className={`sg-badge badge-${finding.severity.toLowerCase()}`}>
                        {finding.severity}
                      </span>
                    </div>
                    <p className="finding-detail">{finding.detail}</p>
                    <div className="finding-remediation">
                      <strong>Recommended Fix:</strong> {finding.remediation}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Tab 2: Blast-Radius Relationship Map */}
      {activeTab === 'blast' && (
        <div className="sg-card">
          <div className="sg-card-header">
            <div>
              <h3 className="sg-card-title">Interactive Cross-Product Blast-Radius Map</h3>
              <p className="sg-card-subtitle">
                Click any Jira blocker, Confluence runbook, active incident, Teamwork Graph team, PR, or production service to inspect its relationship.
              </p>
            </div>
          </div>
          <BlastRadiusMap
            nodes={report.blastRadius.nodes}
            edges={report.blastRadius.edges}
            blastRadiusTier={report.blastRadius.blastRadiusTier}
            graphSource={report.teamworkGraph.source}
          />
        </div>
      )}

      {/* Tab 3: Runbooks & Active Incidents */}
      {activeTab === 'runbooks' && (
        <>
          <div className="sg-card">
            <div className="sg-card-header">
              <div>
                <h3 className="sg-card-title">Active Incident Collisions ({report.incidentCollisions.length})</h3>
                <p className="sg-card-subtitle">
                  Open SEV-1/SEV-2 incidents matching components, labels, or Teamwork Graph services.
                </p>
              </div>
            </div>
            {report.incidentCollisions.length === 0 ? (
              <div className="sg-alert sg-alert-success">
                <div className="sg-alert-title">No Active Incident Collisions</div>
                <div>No active incidents overlap with {report.issueKey}&apos;s affected services.</div>
              </div>
            ) : (
              <div className="finding-list">
                {report.incidentCollisions.map((col) => (
                  <div key={col.incident.key} className={`finding-item sev-${col.impactLevel}`}>
                    <div className="finding-header">
                      <span className="finding-title">
                        {col.incident.key} · {col.incident.summary}
                      </span>
                      <span className={`sg-badge badge-${col.impactLevel.toLowerCase()}`}>
                        {col.incident.severity} · {col.incident.status}
                      </span>
                    </div>
                    <p className="finding-detail">
                      Owner: <strong>{col.incident.ownerName}</strong> · Matched on:{' '}
                      <code>{col.matchedOn.join(', ')}</code> (confidence {col.matchScore}%)
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="sg-card">
            <div className="sg-card-header">
              <div>
                <h3 className="sg-card-title">Linked Confluence Runbooks &amp; ADRs ({report.runbookAudits.length})</h3>
                <p className="sg-card-subtitle">
                  Freshness SLA: {report.policyApplied.runbookFreshnessSlaDays} days · Checks 5 required operational sections.
                </p>
              </div>
              <button
                className="sg-btn sg-btn-primary"
                onClick={handleGenerateRunbook}
                disabled={busyAction !== null}
              >
                + Generate Compliant Runbook Stub
              </button>
            </div>

            {report.runbookAudits.length === 0 ? (
              <div className="sg-alert sg-alert-caution">
                <div className="sg-alert-title">No Confluence Runbook Linked</div>
                <div>
                  Click &ldquo;Generate Compliant Runbook Stub&rdquo; above to automatically create a rollback-ready Confluence page and link it to {report.issueKey}.
                </div>
              </div>
            ) : (
              report.runbookAudits.map((rb) => (
                <div key={rb.pageId} className="dim-card" style={{ marginBottom: 10 }}>
                  <div className="sg-card-header" style={{ marginBottom: 8 }}>
                    <div>
                      <div className="finding-title">{rb.title}</div>
                      <div className="sg-card-subtitle">
                        Page {rb.pageId} · Space {rb.spaceKey} · Updated {rb.ageDays}d ago (SLA {rb.freshnessSlaDays}d)
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span
                        className={`sg-badge ${
                          rb.status === 'HEALTHY'
                            ? 'badge-go'
                            : rb.status === 'NEEDS_ATTENTION'
                              ? 'badge-caution'
                              : 'badge-block'
                        }`}
                      >
                        {rb.score}/100 · {rb.status.replace(/_/g, ' ')}
                      </span>
                      {onOpenRunbook && (
                        <button
                          className="sg-btn sg-btn-subtle"
                          onClick={() => onOpenRunbook(rb.pageId)}
                        >
                          Verify Page →
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {rb.sections.map((sec) => (
                      <span
                        key={sec.id}
                        className={`sg-badge ${sec.present ? 'badge-go' : 'badge-block'}`}
                      >
                        {sec.present ? '✓' : '✕'} {sec.label}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* Tab 4: Governance Audit Log & Drift Snapshots */}
      {activeTab === 'governance' && (
        <>
          <div className="sg-card">
            <div className="sg-card-header">
              <div>
                <h3 className="sg-card-title">Forge KVS Governance Audit Log ({report.decisionHistory.length})</h3>
                <p className="sg-card-subtitle">
                  Immutable override, approval, and hold decisions persisted in @forge/kvs and mirrored to Jira comments.
                </p>
              </div>
              <button className="sg-btn sg-btn-primary" onClick={() => setShowDecisionModal(true)}>
                + Record Decision
              </button>
            </div>
            {report.decisionHistory.length === 0 ? (
              <div className="empty-state">No governance decisions recorded yet for {report.issueKey}.</div>
            ) : (
              report.decisionHistory.map((dec) => (
                <div key={dec.id} className="checklist-row">
                  <div>
                    <div className="finding-title">
                      {dec.decision} by {dec.actorName}{' '}
                      <span style={{ fontWeight: 400, color: '#6b778c', fontSize: 12 }}>
                        (Pre-decision {dec.previousScore}/100 · {dec.previousVerdict})
                      </span>
                    </div>
                    <div style={{ fontSize: 12.5, color: '#42526e', marginTop: 2 }}>{dec.justification}</div>
                  </div>
                  <span className="sg-badge badge-neutral">
                    {new Date(dec.createdAt).toLocaleString()}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="sg-card">
            <div className="sg-card-header">
              <div>
                <h3 className="sg-card-title">Automated Readiness Drift Snapshots ({report.driftHistory.length})</h3>
                <p className="sg-card-subtitle">
                  Captured by Forge trigger <code>avi:jira:updated:issue</code> into Forge KVS to spot late regressions before release.
                </p>
              </div>
            </div>
            {report.driftHistory.length === 0 ? (
              <div className="empty-state">No historical drift snapshots captured yet.</div>
            ) : (
              <div className="sg-table-wrap">
                <table className="sg-table">
                  <thead>
                    <tr>
                      <th>Recorded At</th>
                      <th>Trigger Event</th>
                      <th>Score</th>
                      <th>Verdict</th>
                      <th>Blockers</th>
                      <th>Incidents</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.driftHistory.map((snap, idx) => (
                      <tr key={idx}>
                        <td>{new Date(snap.recordedAt).toLocaleString()}</td>
                        <td><code>{snap.triggerEvent}</code></td>
                        <td><strong>{snap.score}/100</strong></td>
                        <td>
                          <span className={`sg-badge badge-${snap.verdict.toLowerCase()}`}>
                            {snap.verdict}
                          </span>
                        </td>
                        <td>{snap.blockerCount}</td>
                        <td>{snap.incidentCollisionCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Decision / Override Modal */}
      {showDecisionModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Record Ship Decision">
          <div className="modal-card">
            <h3 className="sg-card-title" style={{ marginBottom: 4 }}>
              Record ShipGuard Governance Decision ({report.issueKey})
            </h3>
            <p className="sg-card-subtitle" style={{ marginBottom: 14 }}>
              Overrides downgrade BLOCK to CAUTION with an immutable Forge KVS audit record and Jira issue comment.
            </p>

            <form onSubmit={handleSubmitDecision}>
              <div className="field-group">
                <label className="field-label" htmlFor="sg-decision-select">Decision Type</label>
                <select
                  id="sg-decision-select"
                  className="field-select"
                  value={decisionType}
                  onChange={(e) => setDecisionType(e.target.value as ShipDecisionRecord['decision'])}
                >
                  <option value="OVERRIDDEN">OVERRIDDEN — Accept risk with mitigation</option>
                  <option value="APPROVED">APPROVED — Confirm release sign-off</option>
                  <option value="HELD">HELD — Place explicit release freeze</option>
                </select>
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="sg-actor-input">Engineer / Release Lead</label>
                <input
                  id="sg-actor-input"
                  className="field-input"
                  value={actorName}
                  onChange={(e) => setActorName(e.target.value)}
                  required
                />
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="sg-justification-input">
                  Audit Justification (required, min 8 characters)
                </label>
                <textarea
                  id="sg-justification-input"
                  className="field-textarea"
                  rows={3}
                  placeholder="Example: EU canary isolated behind kill-switch flag; Incident Commander Devon Brooks approved staged US-East rollout."
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  required
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="sg-btn"
                  onClick={() => setShowDecisionModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="sg-btn sg-btn-primary"
                  disabled={busyAction === 'decision'}
                >
                  {busyAction === 'decision' ? 'Saving...' : 'Save Audit Decision'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
