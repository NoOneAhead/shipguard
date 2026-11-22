# Codegeist 2026 — Devpost Submission Packet (ShipGuard)

Copy and paste the sections below directly into the Codegeist 2026 Devpost submission form.

---

## Project Name
**ShipGuard — Pre-Ship Context Intelligence, Blast-Radius Guardian & MCP/Rovo Bridge**

## Tagline (Short Description)
Stop risky releases before merge: live Jira, Confluence, Incident & Teamwork Graph blast-radius scoring inside Jira, Confluence, Rovo Agents, and IDE coding agents via Atlassian MCP.

## Target Prize Category & Stackable Bonus Tracks
- **Grand Prize Category:** Apps for Software Teams
- **Bonus Track 1:** Best Agents — Rovo/Assignable agents (`rovo:agent`, `rovo:skill`, 5 reusable `action` tools)
- **Bonus Track 2:** Best app with Atlassian MCP (`rovo:mcp` exposing all 5 ShipGuard tools + open-source `skills/shipguard-release-check/SKILL.md`)
- **Bonus Track 3:** Best apps with Teamwork Graph integration (`api.asUser().requestTeamworkGraph(...)` curated queries + granular `read:graph:*` scopes + resilient hybrid fallback)
- **Bonus Track 4:** Best Marketplace published app *(once submitted to Atlassian Marketplace using `DEPLOY_GUIDE.md`)*

---

## Devpost Story

### Inspiration
Modern software teams ship dozens of times a day, yet the signals that decide whether a deploy is safe are scattered across four different places: blocking Jira issues, outdated Confluence runbooks missing rollback commands, active SEV-1/SEV-2 incidents in Jira Service Management, and cross-service ownership inside the Teamwork Graph. Worse, AI coding agents inside developers' IDEs can open and merge PRs in seconds without seeing any of that live Atlassian operational context.

We built **ShipGuard** around Codegeist's theme — *"Build with context. Ship with confidence."* — to turn fragmented Atlassian operational data into an instant, deterministic pre-ship safety gate wherever engineers work: inside Jira, inside Confluence, inside Rovo, and right inside their IDE via Atlassian MCP.

### What it does
ShipGuard evaluates every release candidate across **five weighted operational risk dimensions** to compute a transparent **0–100 Release Readiness Score**, a policy-driven **GO / CAUTION / BLOCK** verdict, and an interactive **Blast-Radius Relationship Map**:

1. **Jira Dependencies & Readiness (25%)**: Detects unresolved inward blockers (`is blocked by`), open linked bugs, incomplete subtasks, missing QA sign-off on high-priority issues, and unassigned owners.
2. **Confluence Runbook & ADR Freshness (22%)**: Audits linked Confluence pages via REST API v2 for freshness SLA compliance and 5 mandatory operational sections (*Rollback Procedure, Monitoring & Alerts, Health Checks & Smoke Tests, On-Call Escalation, Post-Deploy Verification*). If a runbook is missing, engineers can click **Generate Rollback Runbook Stub** to create a 100/100 compliant Confluence runbook and auto-link it to the Jira issue.
3. **Active Incident Collisions (23%)**: Scans open SEV-1/SEV-2 incidents and detects collisions on shared Jira components, labels, and Teamwork Graph impacted services — triggering an automatic hard ship-block gate during active SEV-1 outages.
4. **Teamwork Graph Context & Blast Radius (15%)**: Uses `api.asUser().requestTeamworkGraph(...)` with curated GraphQL queries (with graceful fallback to a hybrid Jira/Confluence graph if graph data is sparse) to map owning Atlassian Teams, PR review status, contributors, and cross-service fan-out on an interactive SVG Blast-Radius Map.
5. **Change Drift & Governance (15%)**: Uses a Forge `avi:jira:updated:issue` trigger and `@forge/kvs` to track readiness score regressions over time, flag sensitive tags (`db-migration`, `breaking-change`, `payments`, `auth`), and store immutable human-confirmed governance decisions (`APPROVED`, `OVERRIDDEN`, `HELD`).

Beyond the **Jira Issue Panel**, **Jira Project Release Command Center**, and **Confluence Runbook Verifier**, ShipGuard brings the exact same deterministic tools to:
- **ShipGuard Release Guardian (`rovo:agent` + `rovo:skill`)**: A Rovo Agent with bundled `SKILL.md` instructions and 5 executable actions.
- **ShipGuard MCP Server (`rovo:mcp` + open-source `SKILL.md`)**: Exposes all 5 ShipGuard tools through the Atlassian MCP server so coding agents (Cursor, Claude Code, Antigravity, VS Code) check live production safety straight from the developer's IDE before merging a PR.

### How we built it
- **Platform:** Atlassian Forge (`nodejs24.x`), `@forge/api`, `@forge/kvs`, `@forge/resolver`, `@forge/bridge`, Custom UI built with React 19 + TypeScript + Vite styled faithfully with Atlassian Design System (ADG3) tokens.
- **Zero Paid LLM Credits:** 100% deterministic Forge scoring engine + native Rovo Agent & MCP tool execution — completely free of paid Forge LLM API calls.
- **Shared Core Architecture:** One cleanly typed domain engine (`src/core/`) and orchestrator (`src/services/shipGuardService.ts`) powers the Forge UI Resolver, all 5 Rovo/MCP `action` handlers, the `avi:jira:updated:issue` drift trigger, and a standalone local preview server (`npm run preview`) for instant offline inspection and automated testing.
- **Quality & Validation:** Validated cleanly against Atlassian's official `@forge/manifest` `FullValidationProcessor` (0 errors, 0 warnings) and verified with 34 automated Vitest unit/integration tests plus headless Chrome UI verification (0 console/runtime errors).

### Challenges we ran into
- **Cross-Product Resilience on Fresh Sites:** Teamwork Graph permissions silently omit unreadable nodes rather than throwing errors, and newly provisioned demo sites may have sparse graph edges. We designed a dual-mode Teamwork Graph client that runs curated `requestTeamworkGraph` queries in interactive user context and cleanly enriches or falls back to a hybrid Jira/Confluence relationship graph so the Blast-Radius Map always renders rich, accurate context.
- **Shared Action Surface Across Rovo, Skills, and MCP:** Ensuring all 5 Forge `action` modules satisfy strict schema constraints (23-char function keys, typed `inputs`, `actionVerb` rules, and `SKILL.md` frontmatter) so they work seamlessly across `rovo:agent`, `rovo:skill`, and `rovo:mcp`.
- **Single Bundle Across Forge Custom UI & Local Preview:** `@forge/bridge` throws eagerly if imported outside an Atlassian iframe; lazy-loading `@forge/bridge` inside iframe detection allowed the exact same production Vite bundle to run natively inside Forge *and* locally for instant verification.

### Accomplishments that we're proud of
- Full cross-product coherence across **Jira**, **Confluence**, **Rovo**, **Teamwork Graph**, **Forge KVS**, and **Atlassian MCP** in a single cohesive product experience.
- Real one-click remediation inside Jira — generating a compliant Confluence Rollback Runbook Stub immediately creates the page, links it to Jira, and lifts the live readiness score.
- Genuine IDE-to-Atlassian safety bridge via `rovo:mcp` + `skills/shipguard-release-check/SKILL.md`, ensuring AI coding agents never merge code blindly during an active SEV-1 incident.

### What's next
- Adding Compass scorecard & Bitbucket Pipelines deployment-gate integrations directly into the blast-radius scorer.
- Adding Slack / Teams proactive release-window digests powered by scheduled Forge triggers.
- Completing Atlassian Marketplace publication with enterprise audit export (CSV/JSON) for SOC2 change-management compliance.

---

## Judge Setup & Testing Instructions

### Option A: Test Directly on Your Atlassian Cloud Site (Forge Installation Link — Zero Manual Setup!)
1. Click the submitted **Forge App Installation Link** and install **ShipGuard Release Guardian** on your Atlassian site (select Jira, Confluence, and Rovo).
2. **One-Click Live Demo Scenario Seeder (Recommended First Step!):**
   - Open any Jira project (even a brand-new empty project!) → click **ShipGuard Release Center** in the project sidebar.
   - Click **⚡ Seed Live Demo Scenario (1 Click)** in the Guided Onboarding banner (or header).
   - ShipGuard idempotently creates 4 `[ShipGuard Demo]` Jira issues (a high-risk blocked story, an unresolved blocking task linked via `Blocks`, an active SEV-1 incident sharing service labels, and a green-light GO story) plus Confluence runbooks (gracefully skipping Confluence if space write permission isn't enabled). Clicking twice is 100% safe and creates zero duplicates.
3. **Test the Jira Project Release Command Center:**
   - Observe the red **Active Production Incidents Detected** banner, executive KPIs (`Block / Caution / Go`), and risk-ranked candidate table.
   - Open the **Team Ship-Gate Policy (KVS)** tab, adjust thresholds (e.g., GO threshold or Freshness SLA), click **Save Policy to Forge KVS & Re-Score**, and watch verdicts recalculate live.
4. **Test the Jira Issue Panel & One-Click Fixes:**
   - Click **Inspect Blocked Story** (or open the `[ShipGuard Demo]` blocked story → **Apps → ShipGuard Readiness**).
   - Inspect the **0–100 Readiness Gauge**, **Hard Ship-Gate Blockers**, **5-Dimension Breakdown**, and click the **Blast-Radius Map** tab to inspect connected Teamwork Graph / Jira / Confluence / Incident nodes.
   - Click **Generate Rollback Runbook Stub** to create a compliant 100/100 Confluence runbook and watch the readiness score recalculate live.
   - Click **Post Readiness Audit to Jira** to post a structured audit comment, or **Record Decision / Override** to persist a justified governance record in Forge KVS.
5. **Test the Confluence Runbook Verifier:**
   - Open any Confluence page (including the seeded `[ShipGuard Demo]` Deployment Guide) → click **`•••` (More actions) → Verify Runbook with ShipGuard**.
   - Review the 5-point operational checklist (Rollback, Monitoring, Health Checks, Escalation, Verification) and freshness SLA status.
6. **Test the Rovo Agent & Atlassian MCP Server (`rovo:mcp` + `SKILL.md`):**
   - Open **Rovo Chat**, select **ShipGuard Release Guardian**, and try:
     - *"Is `<ISSUE-KEY>` safe to ship right now?"*
     - *"Check active incident collisions for `<ISSUE-KEY>`"*
     - *"Rank release risks across project `<PROJECT-KEY>`"*
   - Connect an MCP-compatible coding agent (Cursor, Claude Code, Antigravity, VS Code) using [`mcp/README.md`](mcp/README.md) + `skills/shipguard-release-check/SKILL.md` to invoke `evaluate-ship-readiness` straight from your IDE.

### Option B: Instant Local Interactive Preview (Zero Cloud Setup Needed)
Inspect every surface immediately — including simulating a fresh empty site to test the 1-Click Demo Seeder — against seeded Payments Platform data (`PAY-412` BLOCK with SEV-1 collision, `PAY-419` CAUTION, `PAY-425` GO, `PAY-428` missing runbook):
```bash
npm install && npm --prefix static/shipguard-ui install
npm run build && npm test && npm run preview
```
Open `http://127.0.0.1:4173` and use the top surface switcher (including **Simulate Fresh Empty Site**) to explore the Guided Demo Seeder, Release Command Center, Jira Issue Panel, Blast-Radius Map, Confluence Runbook Verifier, and Live Rovo/MCP Tool Tester.

---

## Marketplace Bonus Track Submission Note
Ready-to-paste Atlassian Marketplace listing copy, 512×512 app logo (`docs/assets/shipguard-logo.png`), security/privacy statement (*100% Runs on Atlassian / zero external egress / zero paid Forge LLMs*), and reviewer instructions are bundled in [`MARKETPLACE_KIT.md`](MARKETPLACE_KIT.md) for fast submission to qualify for **Best Marketplace published app ($1,500 × 6)**.
