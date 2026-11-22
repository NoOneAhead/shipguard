---
name: shipguard-release-check
description: Run a live pre-ship blast-radius, incident collision, Confluence runbook freshness, and Jira dependency check via ShipGuard before merging PRs or deploying releases.
---

# ShipGuard Pre-Ship Context & Blast-Radius Check

Use this skill whenever a developer, release manager, or coding agent is about to merge a pull request, cut a release branch, or deploy a Jira issue to production.

## Workflow

1. **Identify the Jira Issue Key or Project Key**
   - Extract the Jira issue key (for example `PAY-412`) from the current Git branch name, PR title, commit message, or user prompt.
   - If the user asks for an overall release overview, extract the Jira project key (for example `PAY`).

2. **Evaluate Full Release Readiness**
   - Call the ShipGuard tool `evaluate-ship-readiness` with `{ "issueKey": "<KEY>" }`.
   - Inspect the returned `score` (0–100), `verdict` (`GO`, `CAUTION`, or `BLOCK`), `hardBlockReasons`, `dimensionScores`, `incidentCollisions`, `runbooks`, and `impactedServices`.

3. **Deep-Dive High-Risk Signals**
   - If `incidentCollisions` is non-empty, call `check-incident-collisions` to obtain incident commander names, severity (`SEV-1` / `SEV-2`), and overlapping services.
   - If `runbooks` shows a missing or stale runbook (or missing Rollback Procedure), call `audit-runbook-freshness` to list exact missing operational sections and remediation steps.
   - If scanning a full release train, call `get-project-release-risk` with `{ "projectKey": "<PROJECT>" }`.

4. **Present a Structured Ship Decision Brief**
   - Lead with the **Verdict** (`GO` / `CAUTION` / `BLOCK`), **Score (0–100)**, and **Blast-Radius Tier**.
   - List every **Hard Block Gate** and **Active Incident Collision** first.
   - Summarize missing Confluence runbook sections or stale SLA gaps.
   - Provide concrete remediation steps ordered by severity.

5. **Governance Decisions (Human-Confirmed Only)**
   - **Never** call `record-ship-decision` with `OVERRIDDEN` or `APPROVED` autonomously.
   - Only invoke `record-ship-decision` after an engineer explicitly confirms the decision and provides an audit justification (minimum 8 characters).

## Guardrails

- Treat `BLOCK` verdicts with active `SEV-1` collisions or unresolved Jira blockers as stop-ship conditions.
- Report exact Jira keys, Confluence page IDs, and active incident keys returned by ShipGuard — never fabricate risk data or override approvals.
