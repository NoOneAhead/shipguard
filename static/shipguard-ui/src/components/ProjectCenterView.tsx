import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { invokeBackend, invokeRovoToolPreview } from '../bridge';
import { DemoSeedResult, PolicyConfig, ProjectReleaseSummary, ShipVerdict } from '../types';

interface ProjectCenterViewProps {
  projectKey: string;
  isForge: boolean;
  refreshToken?: number;
  onInspectIssue?: (issueKey: string) => void;
  onSeededWorkspace?: () => void;
}

type CenterTab = 'candidates' | 'policy' | 'rovo-mcp';

const ROVO_MCP_TOOLS = [
  {
    key: 'evaluate-ship-readiness',
    verb: 'GET',
    description: 'Compute full 0-100 readiness score, verdict, blast-radius graph, and findings for an issue.',
    samplePayload: { issueKey: 'PAY-412' }
  },
  {
    key: 'check-incident-collisions',
    verb: 'GET',
    description: 'Detect active SEV-1 / SEV-2 incidents overlapping with issue components and services.',
    samplePayload: { issueKey: 'PAY-412' }
  },
  {
    key: 'audit-runbook-freshness',
    verb: 'GET',
    description: 'Audit Confluence runbook freshness SLA and 5 required operational sections.',
    samplePayload: { pageId: 'CONF-101', projectKey: 'PAY' }
  },
  {
    key: 'get-project-release-risk',
    verb: 'GET',
    description: 'Rank all active project release candidates by pre-ship risk and blockers.',
    samplePayload: { projectKey: 'PAY' }
  },
  {
    key: 'record-ship-decision',
    verb: 'CREATE',
    description: 'Record a human-confirmed governance decision (APPROVED / OVERRIDDEN / HELD) in Forge KVS.',
    samplePayload: {
      issueKey: 'PAY-419',
      decision: 'APPROVED',
      justification: 'Verified latency mitigation with SRE Sora Takahashi in EU staging.',
      actorName: 'MCP Demo Reviewer'
    }
  }
];

export const ProjectCenterView: React.FC<ProjectCenterViewProps> = ({
  projectKey,
  isForge,
  refreshToken,
  onInspectIssue,
  onSeededWorkspace
}) => {
  const [summary, setSummary] = useState<ProjectReleaseSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<CenterTab>('candidates');
  const [seedingDemo, setSeedingDemo] = useState(false);
  const [lastSeedResult, setLastSeedResult] = useState<DemoSeedResult | null>(null);

  // Filter state
  const [search, setSearch] = useState('');
  const [verdictFilter, setVerdictFilter] = useState<'ALL' | ShipVerdict>('ALL');

  // Policy draft
  const [policyDraft, setPolicyDraft] = useState<PolicyConfig | null>(null);
  const [savingPolicy, setSavingPolicy] = useState(false);

  // Rovo / MCP Tool Playground
  const [selectedToolKey, setSelectedToolKey] = useState(ROVO_MCP_TOOLS[0].key);
  const [toolPayloadText, setToolPayloadText] = useState(
    JSON.stringify(ROVO_MCP_TOOLS[0].samplePayload, null, 2)
  );
  const [toolResponseText, setToolResponseText] = useState<string>('');
  const [runningTool, setRunningTool] = useState(false);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await invokeBackend<ProjectReleaseSummary>('getProjectReleaseSummary', {
        projectKey
      });
      setSummary(data);
      setPolicyDraft(data.policy);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load project release summary.');
    } finally {
      setLoading(false);
    }
  }, [projectKey]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary, refreshToken]);

  const handleSeedDemoScenario = async () => {
    setSeedingDemo(true);
    setError(null);
    try {
      const result = await invokeBackend<DemoSeedResult>('seedDemoScenario', {
        projectKey
      });
      setLastSeedResult(result);
      await loadSummary();
      onSeededWorkspace?.();
      if (result.alreadySeeded) {
        setToast(
          `[ShipGuard Demo] scenario is already present in ${projectKey} (${result.existingCount} items verified — zero duplicates created).`
        );
      } else {
        setToast(
          `Seeded ${result.createdCount} live [ShipGuard Demo] items in ${projectKey}${result.warnings.length > 0 ? ` (${result.warnings.length} note)` : ''}!`
        );
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to seed ShipGuard demo scenario.');
    } finally {
      setSeedingDemo(false);
    }
  };

  const filteredCandidates = useMemo(() => {
    if (!summary) return [];
    const q = search.trim().toLowerCase();
    return summary.candidates.filter((c) => {
      if (verdictFilter !== 'ALL' && c.verdict !== verdictFilter) return false;
      if (!q) return true;
      return (
        c.issueKey.toLowerCase().includes(q) ||
        c.summary.toLowerCase().includes(q) ||
        c.assigneeName.toLowerCase().includes(q) ||
        c.components.some((comp) => comp.toLowerCase().includes(q))
      );
    });
  }, [summary, search, verdictFilter]);

  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!policyDraft) return;
    setSavingPolicy(true);
    setError(null);
    try {
      await invokeBackend<PolicyConfig>('updateProjectPolicy', {
        projectKey,
        updates: {
          goThreshold: policyDraft.goThreshold,
          cautionThreshold: policyDraft.cautionThreshold,
          runbookFreshnessSlaDays: policyDraft.runbookFreshnessSlaDays,
          blockOnSev1Collision: policyDraft.blockOnSev1Collision,
          blockOnOpenBlocker: policyDraft.blockOnOpenBlocker,
          requireQaSignOffForHighPriority: policyDraft.requireQaSignOffForHighPriority
        }
      });
      await loadSummary();
      setToast(`Saved ${projectKey} ship-gate policy to Forge KVS and re-scored all release candidates.`);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to update project policy.');
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleSelectTool = (toolKey: string) => {
    setSelectedToolKey(toolKey);
    const meta = ROVO_MCP_TOOLS.find((t) => t.key === toolKey);
    if (meta) {
      setToolPayloadText(JSON.stringify(meta.samplePayload, null, 2));
    }
    setToolResponseText('');
  };

  const handleRunMcpTool = async () => {
    setRunningTool(true);
    setError(null);
    try {
      const parsed = JSON.parse(toolPayloadText);
      if (isForge) {
        // Inside Forge UI, map to resolver equivalent where available
        if (selectedToolKey === 'evaluate-ship-readiness') {
          const res = await invokeBackend('evaluateIssueReadiness', parsed);
          setToolResponseText(JSON.stringify(res, null, 2));
        } else if (selectedToolKey === 'get-project-release-risk') {
          const res = await invokeBackend('getProjectReleaseSummary', parsed);
          setToolResponseText(JSON.stringify(res, null, 2));
        } else if (selectedToolKey === 'audit-runbook-freshness') {
          const res = await invokeBackend('auditConfluenceRunbook', parsed);
          setToolResponseText(JSON.stringify(res, null, 2));
        } else {
          setToolResponseText(
            JSON.stringify(
              {
                note: 'Invoke this action via Atlassian Rovo Agent ("ShipGuard Release Guardian") or an MCP client connected to Atlassian MCP Server.'
              },
              null,
              2
            )
          );
        }
      } else {
        const res = await invokeRovoToolPreview(selectedToolKey, parsed);
        setToolResponseText(JSON.stringify(res, null, 2));
        if (selectedToolKey === 'record-ship-decision') {
          await loadSummary();
        }
      }
    } catch (err: any) {
      setToolResponseText(JSON.stringify({ ok: false, error: err?.message ?? 'Invalid JSON input' }, null, 2));
    } finally {
      setRunningTool(false);
    }
  };

  if (loading && !summary) {
    return (
      <div className="sg-card">
        <div className="empty-state">Scanning Jira release queue, Confluence runbooks, JSM incidents, and Teamwork Graph for {projectKey}...</div>
      </div>
    );
  }

  if (error && !summary) {
    return (
      <div className="sg-alert sg-alert-block">
        <div className="sg-alert-title">Could not load Release Command Center</div>
        <div>{error}</div>
      </div>
    );
  }

  if (!summary) return null;

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

      {/* Command Center Header */}
      <div className="sg-card" style={{ marginBottom: 14 }}>
        <div className="sg-card-header" style={{ marginBottom: 0 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              <span className="issue-key-chip">{summary.projectKey}</span>
              <span className="sg-badge badge-purple">Teamwork Graph + Rovo + MCP Enabled</span>
              <span className="sg-badge badge-neutral">
                GO ≥ {summary.policy.goThreshold} · SLA {summary.policy.runbookFreshnessSlaDays}d
              </span>
            </div>
            <h1 className="issue-heading" style={{ marginBottom: 2 }}>
              ShipGuard Release Command Center — {summary.projectName}
            </h1>
            <p className="sg-card-subtitle">
              Build with context. Ship with confidence. Live blast-radius governance across Jira, Confluence, Incidents, and Teamwork Graph.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="sg-btn"
              onClick={handleSeedDemoScenario}
              disabled={seedingDemo || loading}
              title="Idempotently creates [ShipGuard Demo] Jira issues, blocker link, active SEV-1 incident, and Confluence runbook stub"
            >
              {seedingDemo
                ? 'Seeding Demo...'
                : summary.hasDemoScenario
                  ? 'Demo Scenario Seeded ✓'
                  : 'Seed Live Demo Scenario'}
            </button>
            <button className="sg-btn sg-btn-primary" onClick={loadSummary} disabled={loading}>
              {loading ? 'Refreshing...' : 'Refresh Live Signals'}
            </button>
          </div>
        </div>

        {(lastSeedResult || summary.demoSeedInfo) && (() => {
          const seed = lastSeedResult ?? summary.demoSeedInfo!;
          return (
            <div className="seeder-summary-bar">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <strong style={{ fontSize: 13 }}>
                    {seed.alreadySeeded
                      ? `Live [ShipGuard Demo] Scenario Active in ${seed.projectKey}`
                      : `Created Live [ShipGuard Demo] Scenario in ${seed.projectKey} (${seed.createdCount} items)`}
                  </strong>
                  <div style={{ fontSize: 12, color: '#42526e', marginTop: 2 }}>
                    {seed.items
                      .filter((i) => i.status !== 'SKIPPED')
                      .map((i) => `${i.keyOrId}`)
                      .join(' · ')}
                  </div>
                </div>
                {seed.primaryIssueKey && onInspectIssue && (
                  <button
                    className="sg-btn sg-btn-primary"
                    onClick={() => onInspectIssue(seed.primaryIssueKey!)}
                  >
                    Inspect Blocked Story ({seed.primaryIssueKey}) →
                  </button>
                )}
              </div>
              {seed.warnings.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 12, color: '#974f0c' }}>
                  <strong>Note:</strong> {seed.warnings.join(' ')}
                </div>
              )}
            </div>
          );
        })()}

        {summary.activeIncidents.length > 0 && (
          <div className="sg-alert sg-alert-block">
            <div className="sg-alert-title">
              Active Production Incidents Detected ({summary.activeIncidents.length}) — Collision Guard Active
            </div>
            <ul className="sg-alert-list">
              {summary.activeIncidents.map((inc) => (
                <li key={inc.key}>
                  <strong>
                    {inc.key} ({inc.severity} · {inc.status})
                  </strong>
                  : {inc.summary} — Components: <code>{inc.components.join(', ')}</code> (Commander: {inc.ownerName})
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Guided Empty-State Seeder Banner (shown on fresh sites with 0 candidates or no active demo scenario yet) */}
      {(summary.candidates.length === 0 || (!summary.hasDemoScenario && summary.kpis.activeSev1Sev2Incidents === 0)) && (
        <section className="seeder-hero" aria-label="ShipGuard Guided Demo Seeder">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                <span className="sg-badge badge-low">FRESH SITE QUICKSTART</span>
                <span className="sg-badge badge-purple">IDEMPOTENT · SAFE TO CLICK TWICE</span>
              </div>
              <h2 style={{ margin: '0 0 4px', fontSize: 18, color: '#172b4d' }}>
                {summary.candidates.length === 0
                  ? `No active release candidates in ${summary.projectKey} yet — seed a live scenario in 1 click`
                  : `Want to test ShipGuard's full Blast-Radius & Incident Collision flow in ${summary.projectKey}?`}
              </h2>
              <p style={{ margin: 0, fontSize: 13, color: '#42526e', maxWidth: 740 }}>
                Create a realistic <code>[ShipGuard Demo]</code> release train right inside this Jira project and Confluence site so you can test Hard-Block SEV-1 collision gates, Blast-Radius graphs, one-click Rollback Runbook stubs, Rovo Agent prompts, and Atlassian MCP tools immediately.
              </p>
            </div>
            <button
              className="sg-btn sg-btn-primary"
              style={{ padding: '10px 16px', fontSize: 13.5 }}
              onClick={handleSeedDemoScenario}
              disabled={seedingDemo}
            >
              {seedingDemo ? 'Creating Live Demo Items...' : '⚡ Seed Live Demo Scenario (1 Click)'}
            </button>
          </div>

          <div className="seeder-grid">
            <div className="seeder-pill-card">
              <div className="seeder-pill-title">1. Blocked Critical Story</div>
              <div className="seeder-pill-desc">
                Dual-key HMAC rollout tagged <code>checkout-webhooks</code> + <code>security-sensitive</code> (BLOCK).
              </div>
            </div>
            <div className="seeder-pill-card">
              <div className="seeder-pill-title">2. Unresolved Blocker Link</div>
              <div className="seeder-pill-desc">
                Prerequisite KMS Vault task linked via Jira <code>Blocks</code> relation.
              </div>
            </div>
            <div className="seeder-pill-card">
              <div className="seeder-pill-title">3. Active SEV-1 Incident</div>
              <div className="seeder-pill-desc">
                Overlapping <code>checkout-webhooks</code> outage firing ShipGuard&apos;s Hard-Block gate.
              </div>
            </div>
            <div className="seeder-pill-card">
              <div className="seeder-pill-title">4. Green-Light GO Story + Runbooks</div>
              <div className="seeder-pill-desc">
                Clean QA-approved story + Confluence runbook stubs (gracefully skips if Confluence write is restricted).
              </div>
            </div>
          </div>
        </section>
      )}

      {/* KPI Row */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Avg Ship Readiness</div>
          <div
            className={`kpi-value ${
              summary.kpis.averageScore >= summary.policy.goThreshold
                ? 'good'
                : summary.kpis.averageScore >= summary.policy.cautionThreshold
                  ? 'warn'
                  : 'danger'
            }`}
          >
            {summary.kpis.averageScore}
            <span style={{ fontSize: 15, fontWeight: 600, color: '#6b778c' }}>/100</span>
          </div>
          <div className="kpi-foot">{summary.kpis.totalCandidates} active release candidates</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Verdict Breakdown</div>
          <div
            className="kpi-value"
            style={{ fontSize: 18, paddingTop: 6, whiteSpace: 'nowrap', display: 'flex', gap: 6, alignItems: 'center' }}
          >
            <span style={{ color: '#bf2600' }}>{summary.kpis.blockCount} Block</span>
            <span style={{ color: '#97a0af' }}>·</span>
            <span style={{ color: '#974f0c' }}>{summary.kpis.cautionCount} Caution</span>
            <span style={{ color: '#97a0af' }}>·</span>
            <span style={{ color: '#006644' }}>{summary.kpis.goCount} Go</span>
          </div>
          <div className="kpi-foot">Policy-gated pre-ship verdicts</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Active SEV-1 / SEV-2</div>
          <div className={`kpi-value ${summary.kpis.activeSev1Sev2Incidents > 0 ? 'danger' : 'good'}`}>
            {summary.kpis.activeSev1Sev2Incidents}
          </div>
          <div className="kpi-foot">Auto-matched against components &amp; services</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Runbook Gaps / Stale</div>
          <div className={`kpi-value ${summary.kpis.staleRunbooksCount > 0 ? 'warn' : 'good'}`}>
            {summary.kpis.staleRunbooksCount}
          </div>
          <div className="kpi-foot">Freshness SLA: {summary.policy.runbookFreshnessSlaDays} days</div>
        </div>
      </div>

      {/* Main Command Center Tabs */}
      <div className="sg-tabs" role="tablist">
        <button
          className={`sg-tab ${activeTab === 'candidates' ? 'active' : ''}`}
          onClick={() => setActiveTab('candidates')}
          role="tab"
        >
          Release Candidates <span className="sg-tab-count">{summary.candidates.length}</span>
        </button>
        <button
          className={`sg-tab ${activeTab === 'policy' ? 'active' : ''}`}
          onClick={() => setActiveTab('policy')}
          role="tab"
        >
          Team Ship-Gate Policy (KVS)
        </button>
        <button
          className={`sg-tab ${activeTab === 'rovo-mcp' ? 'active' : ''}`}
          onClick={() => setActiveTab('rovo-mcp')}
          role="tab"
        >
          Rovo Agent &amp; Atlassian MCP Hub <span className="sg-tab-count">5 Tools</span>
        </button>
      </div>

      {/* Tab 1: Ranked Release Candidates */}
      {activeTab === 'candidates' && (
        <div className="sg-card">
          <div className="filter-bar">
            <input
              type="search"
              className="search-input"
              placeholder="Filter by key, summary, owner, or component..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="filter-pills">
              {(['ALL', 'BLOCK', 'CAUTION', 'GO'] as const).map((v) => (
                <button
                  key={v}
                  className={`filter-pill ${verdictFilter === v ? 'active' : ''}`}
                  onClick={() => setVerdictFilter(v)}
                >
                  {v === 'ALL' ? `All (${summary.candidates.length})` : v}
                </button>
              ))}
            </div>
          </div>

          <div className="sg-table-wrap">
            <table className="sg-table">
              <thead>
                <tr>
                  <th>Issue</th>
                  <th>Verdict</th>
                  <th>Score</th>
                  <th>Blast Radius</th>
                  <th>Runbook</th>
                  <th>Incidents</th>
                  <th>Top Blocker / Risk Signal</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredCandidates.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <div className="empty-state">
                        {summary.candidates.length === 0
                          ? `No active release candidates in ${summary.projectKey} yet. Click "Seed Live Demo Scenario (1 Click)" above to create a ready-to-test release train.`
                          : 'No release candidates match your current filter.'}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredCandidates.map((c) => {
                  const tone = c.verdict === 'GO' ? 'go' : c.verdict === 'CAUTION' ? 'caution' : 'block';
                  return (
                    <tr key={c.issueKey}>
                      <td>
                        <div style={{ fontWeight: 700, color: '#0052cc', fontFamily: 'var(--sg-mono)', fontSize: 12.5 }}>
                          {c.issueKey}
                          {c.hasOverride && (
                            <span className="sg-badge badge-purple" style={{ marginLeft: 6 }}>
                              Overridden
                            </span>
                          )}
                        </div>
                        <div style={{ fontWeight: 600, maxWidth: 310 }}>{c.summary}</div>
                        <div style={{ fontSize: 11.5, color: '#6b778c' }}>
                          {c.assigneeName} · {c.components.join(', ') || 'No component'}
                        </div>
                      </td>
                      <td>
                        <span className={`sg-badge badge-${tone}`}>{c.verdict}</span>
                      </td>
                      <td style={{ minWidth: 96 }}>
                        <div style={{ fontWeight: 800, fontSize: 14 }}>{c.score}/100</div>
                        <div className="progress-track" style={{ marginBottom: 0, marginTop: 4 }}>
                          <div className={`progress-fill ${tone}`} style={{ width: `${c.score}%` }} />
                        </div>
                      </td>
                      <td>
                        <span
                          className={`sg-badge ${
                            c.blastRadiusTier === 'CRITICAL'
                              ? 'badge-critical'
                              : c.blastRadiusTier === 'WIDE'
                                ? 'badge-high'
                                : c.blastRadiusTier === 'MODERATE'
                                  ? 'badge-medium'
                                  : 'badge-low'
                          }`}
                        >
                          {c.blastRadiusTier}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`sg-badge ${
                            c.runbookStatus === 'HEALTHY'
                              ? 'badge-go'
                              : c.runbookStatus === 'NEEDS_ATTENTION'
                                ? 'badge-caution'
                                : 'badge-block'
                          }`}
                        >
                          {c.runbookStatus.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>
                        {c.incidentCollisionCount > 0 ? (
                          <span className="sg-badge badge-critical">
                            {c.incidentCollisionCount} COLLISION
                          </span>
                        ) : (
                          <span className="sg-badge badge-go">CLEAR</span>
                        )}
                      </td>
                      <td style={{ maxWidth: 260, fontSize: 12, color: '#42526e' }}>
                        {c.topBlocker ?? 'All ship gates green'}
                      </td>
                      <td>
                        {onInspectIssue ? (
                          <button
                            className="sg-btn sg-btn-primary"
                            onClick={() => onInspectIssue(c.issueKey)}
                          >
                            Inspect
                          </button>
                        ) : (
                          <span className="sg-badge badge-neutral">Open in Issue</span>
                        )}
                      </td>
                    </tr>
                  );
                }))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Interactive Project Ship-Gate Policy */}
      {activeTab === 'policy' && policyDraft && (
        <div className="sg-card">
          <div className="sg-card-header">
            <div>
              <h3 className="sg-card-title">Project Ship-Gate Thresholds &amp; Hard Gates ({projectKey})</h3>
              <p className="sg-card-subtitle">
                Persisted per project in <code>@forge/kvs</code>. Saving immediately recalculates every candidate&apos;s verdict.
              </p>
            </div>
          </div>

          <form onSubmit={handleSavePolicy}>
            <div className="policy-grid">
              <div className="field-group">
                <label className="field-label" htmlFor="pol-go">
                  GO Threshold: {policyDraft.goThreshold}/100
                </label>
                <input
                  id="pol-go"
                  type="range"
                  min={60}
                  max={95}
                  value={policyDraft.goThreshold}
                  onChange={(e) =>
                    setPolicyDraft({ ...policyDraft, goThreshold: Number(e.target.value) })
                  }
                />
                <span className="field-help">Minimum readiness score required for an automatic GO verdict.</span>
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="pol-caution">
                  CAUTION Threshold: {policyDraft.cautionThreshold}/100
                </label>
                <input
                  id="pol-caution"
                  type="range"
                  min={25}
                  max={Math.min(85, policyDraft.goThreshold - 5)}
                  value={policyDraft.cautionThreshold}
                  onChange={(e) =>
                    setPolicyDraft({ ...policyDraft, cautionThreshold: Number(e.target.value) })
                  }
                />
                <span className="field-help">Scores below this threshold automatically trigger BLOCK.</span>
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="pol-sla">
                  Confluence Runbook Freshness SLA (days)
                </label>
                <input
                  id="pol-sla"
                  type="number"
                  className="field-input"
                  min={7}
                  max={365}
                  value={policyDraft.runbookFreshnessSlaDays}
                  onChange={(e) =>
                    setPolicyDraft({
                      ...policyDraft,
                      runbookFreshnessSlaDays: Number(e.target.value)
                    })
                  }
                />
                <span className="field-help">Runbooks older than this SLA are flagged stale and penalized.</span>
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
              <label className="toggle-row">
                <div>
                  <div className="field-label">Hard-Block on Active SEV-1 Incident Collision</div>
                  <div className="field-help">Forces BLOCK verdict whenever a SEV-1 incident overlaps with impacted services.</div>
                </div>
                <input
                  type="checkbox"
                  checked={policyDraft.blockOnSev1Collision}
                  onChange={(e) =>
                    setPolicyDraft({ ...policyDraft, blockOnSev1Collision: e.target.checked })
                  }
                />
              </label>

              <label className="toggle-row">
                <div>
                  <div className="field-label">Hard-Block on Unresolved Jira Blockers</div>
                  <div className="field-help">Forces BLOCK verdict when an inward &ldquo;is blocked by&rdquo; link is not Done.</div>
                </div>
                <input
                  type="checkbox"
                  checked={policyDraft.blockOnOpenBlocker}
                  onChange={(e) =>
                    setPolicyDraft({ ...policyDraft, blockOnOpenBlocker: e.target.checked })
                  }
                />
              </label>

              <label className="toggle-row">
                <div>
                  <div className="field-label">Require QA Sign-Off on High / Highest Priority Issues</div>
                  <div className="field-help">Penalizes high-priority releases missing QA verification sign-off.</div>
                </div>
                <input
                  type="checkbox"
                  checked={policyDraft.requireQaSignOffForHighPriority}
                  onChange={(e) =>
                    setPolicyDraft({
                      ...policyDraft,
                      requireQaSignOffForHighPriority: e.target.checked
                    })
                  }
                />
              </label>
            </div>

            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="sg-btn sg-btn-primary" disabled={savingPolicy}>
                {savingPolicy ? 'Saving Policy...' : 'Save Policy to Forge KVS & Re-Score'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab 3: Rovo Agent & Atlassian MCP Live Tool Hub */}
      {activeTab === 'rovo-mcp' && (
        <div className="policy-grid" style={{ gridTemplateColumns: '1.15fr 1fr' }}>
          <div className="sg-card">
            <div className="sg-card-header">
              <div>
                <h3 className="sg-card-title">Live Rovo &amp; Atlassian MCP Tool Tester</h3>
                <p className="sg-card-subtitle">
                  All 5 Forge <code>action</code> modules are exposed simultaneously via <code>rovo:agent</code>, <code>rovo:skill</code>, and <code>rovo:mcp</code>.
                </p>
              </div>
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="mcp-tool-select">Select ShipGuard MCP / Rovo Action</label>
              <select
                id="mcp-tool-select"
                className="field-select"
                value={selectedToolKey}
                onChange={(e) => handleSelectTool(e.target.value)}
              >
                {ROVO_MCP_TOOLS.map((t) => (
                  <option key={t.key} value={t.key}>
                    [{t.verb}] {t.key}
                  </option>
                ))}
              </select>
              <span className="field-help">
                {ROVO_MCP_TOOLS.find((t) => t.key === selectedToolKey)?.description}
              </span>
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="mcp-payload">Tool Input JSON</label>
              <textarea
                id="mcp-payload"
                className="field-textarea"
                style={{ fontFamily: 'var(--sg-mono)', fontSize: 12 }}
                rows={5}
                value={toolPayloadText}
                onChange={(e) => setToolPayloadText(e.target.value)}
              />
            </div>

            <button
              className="sg-btn sg-btn-primary"
              onClick={handleRunMcpTool}
              disabled={runningTool}
            >
              {runningTool ? 'Invoking Action...' : `Execute ${selectedToolKey}`}
            </button>

            {toolResponseText && (
              <div style={{ marginTop: 12 }}>
                <div className="field-label" style={{ marginBottom: 4 }}>Structured Tool Response</div>
                <pre className="code-box">{toolResponseText}</pre>
              </div>
            )}
          </div>

          <div className="sg-card">
            <div className="sg-card-header">
              <div>
                <h3 className="sg-card-title">
                  IDE &amp; Coding Agent Integration (<code>rovo:mcp</code> + <code>SKILL.md</code>)
                </h3>
                <p className="sg-card-subtitle">
                  Connect Cursor, Claude Code, Antigravity, or VS Code to the Atlassian MCP server so coding agents verify release safety before merging PRs.
                </p>
              </div>
            </div>

            <div className="field-label" style={{ marginBottom: 4 }}>
              1. Bundled Open-Source Skill (<code>skills/shipguard-release-check/SKILL.md</code>)
            </div>
            <pre className="code-box" style={{ maxHeight: 165 }}>{`---
name: shipguard-release-check
description: Run a live pre-ship blast-radius, incident collision,
  Confluence runbook freshness, and Jira dependency check via ShipGuard.
---
1. Extract Jira issue key from current Git branch or PR title.
2. Call evaluate-ship-readiness({ issueKey }).
3. If incidentCollisions > 0, call check-incident-collisions.
4. Lead with Verdict (GO / CAUTION / BLOCK) and Hard Block Gates.`}</pre>

            <div className="field-label" style={{ margin: '12px 0 4px' }}>
              2. Rovo Agent Conversation Starters (<code>rovo:agent</code>)
            </div>
            <div className="finding-list" style={{ gap: 6 }}>
              <div className="checklist-row" style={{ marginBottom: 0 }}>
                <span>&ldquo;Is PAY-412 safe to ship right now?&rdquo;</span>
                <span className="sg-badge badge-purple">Rovo</span>
              </div>
              <div className="checklist-row" style={{ marginBottom: 0 }}>
                <span>&ldquo;Check active incident collisions for PAY-412&rdquo;</span>
                <span className="sg-badge badge-purple">Rovo</span>
              </div>
              <div className="checklist-row" style={{ marginBottom: 0 }}>
                <span>&ldquo;Rank release risks across project PAY&rdquo;</span>
                <span className="sg-badge badge-purple">Rovo</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
