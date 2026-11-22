import React, { useEffect, useState } from 'react';
import { AppRuntimeContext, HostSurface, resolveHostContext } from './bridge';
import { ConfluenceVerifierView } from './components/ConfluenceVerifierView';
import { IssuePanelView } from './components/IssuePanelView';
import { ProjectCenterView } from './components/ProjectCenterView';
import { PreviewSeedInfo } from './types';

export const App: React.FC = () => {
  const [ctx, setCtx] = useState<AppRuntimeContext | null>(null);
  const [seedInfo, setSeedInfo] = useState<PreviewSeedInfo | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [emptySiteMode, setEmptySiteMode] = useState(false);

  const loadPreviewSeedInfo = () => {
    fetch('/api/preview/seed')
      .then((r) => (r.ok ? r.json() : null))
      .then((info) => {
        if (info) {
          setSeedInfo(info);
          setEmptySiteMode(Array.isArray(info.issues) && info.issues.length === 0);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    resolveHostContext().then((resolved) => {
      setCtx(resolved);
      if (!resolved.isForge) {
        const params = new URLSearchParams(window.location.search);
        if (params.get('empty') === '1') {
          fetch('/api/preview/mode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'empty' })
          })
            .then(() => {
              setEmptySiteMode(true);
              setRefreshToken((n) => n + 1);
              loadPreviewSeedInfo();
            })
            .catch(() => {});
        } else {
          loadPreviewSeedInfo();
        }
      }
    });
  }, []);

  const handleTogglePreviewEmptyMode = async () => {
    const nextMode = emptySiteMode ? 'reset' : 'empty';
    await fetch('/api/preview/mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: nextMode })
    });
    setEmptySiteMode(nextMode === 'empty');
    setRefreshToken((n) => n + 1);
    loadPreviewSeedInfo();
  };

  if (!ctx) {
    return (
      <div className="sg-container">
        <div className="sg-card">
          <div className="empty-state">Initializing ShipGuard...</div>
        </div>
      </div>
    );
  }

  const switchSurface = (surface: HostSurface) => {
    setCtx((prev) => (prev ? { ...prev, surface } : prev));
  };

  const inspectIssue = (issueKey: string) => {
    setCtx((prev) => (prev ? { ...prev, surface: 'jira:issuePanel', issueKey } : prev));
  };

  const openRunbook = (pageId: string) => {
    setCtx((prev) => (prev ? { ...prev, surface: 'confluence:contentAction', pageId } : prev));
  };

  return (
    <>
      {!ctx.isForge && (
        <header className="preview-bar">
          <div className="preview-brand">
            <div className="preview-logo">SG</div>
            <div>
              <div className="preview-title">ShipGuard — Codegeist 2026 Live Forge Preview</div>
            </div>
            <span className="preview-badge">Local Mock Atlassian Cloud</span>
          </div>

          <div className="preview-controls">
            <button
              className={`surface-pill ${ctx.surface === 'jira:projectPage' ? 'active' : ''}`}
              onClick={() => switchSurface('jira:projectPage')}
            >
              Jira Release Center
            </button>
            <button
              className={`surface-pill ${ctx.surface === 'jira:issuePanel' ? 'active' : ''}`}
              onClick={() => switchSurface('jira:issuePanel')}
            >
              Jira Issue Panel
            </button>
            <button
              className={`surface-pill ${ctx.surface === 'confluence:contentAction' ? 'active' : ''}`}
              onClick={() => switchSurface('confluence:contentAction')}
            >
              Confluence Runbook Verifier
            </button>

            <button
              className={`surface-pill ${emptySiteMode ? 'active' : ''}`}
              onClick={handleTogglePreviewEmptyMode}
              title="Toggle between Fresh Empty Jira Site (to test the 1-Click Judge Demo Seeder) and Pre-Seeded Payments Workspace"
            >
              {emptySiteMode ? 'Restore Full PAY Workspace' : 'Simulate Fresh Empty Site'}
            </button>

            {ctx.surface === 'jira:issuePanel' && seedInfo && (
              <select
                className="preview-select"
                aria-label="Select Jira Issue"
                value={ctx.issueKey}
                onChange={(e) => setCtx({ ...ctx, issueKey: e.target.value })}
              >
                {seedInfo.issues.map((i) => (
                  <option key={i.key} value={i.key}>
                    {i.key}: {i.summary.slice(0, 42)}
                  </option>
                ))}
              </select>
            )}

            {ctx.surface === 'confluence:contentAction' && seedInfo && (
              <select
                className="preview-select"
                aria-label="Select Confluence Page"
                value={ctx.pageId}
                onChange={(e) => setCtx({ ...ctx, pageId: e.target.value })}
              >
                {seedInfo.pages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id}: {p.title.slice(0, 42)}
                  </option>
                ))}
              </select>
            )}
          </div>
        </header>
      )}

      <main className={`sg-container ${ctx.surface === 'jira:issuePanel' ? 'compact' : ''}`}>
        {ctx.surface === 'jira:projectPage' && (
          <ProjectCenterView
            projectKey={ctx.projectKey}
            isForge={ctx.isForge}
            refreshToken={refreshToken}
            onInspectIssue={ctx.isForge ? undefined : inspectIssue}
            onSeededWorkspace={ctx.isForge ? undefined : loadPreviewSeedInfo}
          />
        )}

        {ctx.surface === 'jira:issuePanel' && (
          <IssuePanelView
            issueKey={ctx.issueKey}
            onNavigateProject={ctx.isForge ? undefined : () => switchSurface('jira:projectPage')}
            onOpenRunbook={ctx.isForge ? undefined : openRunbook}
          />
        )}

        {ctx.surface === 'confluence:contentAction' && (
          <ConfluenceVerifierView
            pageId={ctx.pageId}
            projectKey={ctx.projectKey}
            onInspectIssue={ctx.isForge ? undefined : inspectIssue}
          />
        )}
      </main>
    </>
  );
};
