# ShipGuard — Atlassian Marketplace Listing Kit (Bonus Track)

Use this copy-paste kit to submit **ShipGuard Release Guardian** to the **Atlassian Marketplace Partner Portal** in ~5 minutes and qualify for the **Best Marketplace published app ($1,500 × 6)** Codegeist 2026 stackable bonus prize.

---

## 1. Basic App Listing Fields

- **App Name:** `ShipGuard — Release Context & Blast-Radius Guardian`
- **Pricing:** `Free` *(Forge app — zero external billing, zero paid Forge LLM usage)*
- **Tagline (Short Summary, <=160 chars):**
  > Pre-ship readiness scoring, blast-radius maps, incident collision guards, and Confluence runbook audits inside Jira, Confluence, Rovo, and Atlassian MCP.
- **Categories:** `DevOps`, `Software Development`, `Release Management`, `ITSM / Incident Management`, `AI & Rovo Agents`
- **App Logo (512×512 PNG):** Upload [`docs/assets/shipguard-logo.png`](docs/assets/shipguard-logo.png) *(vector source: [`docs/assets/shipguard-logo.svg`](docs/assets/shipguard-logo.svg))*
- **Marketplace Gallery Screenshots:** Upload directly from [`docs/images/`](docs/images/):
  1. `docs/images/shipguard-release-center.png` — *Jira Project Release Command Center ranking active release candidates & incident collisions*
  2. `docs/images/shipguard-issue-panel-block.png` — *Jira Issue Panel 0–100 Readiness Gauge, Hard-Block Gates & 5-Dimension Risk Breakdown*
  3. `docs/images/shipguard-blast-radius-map.png` — *Interactive Cross-Product Blast-Radius Map powered by Teamwork Graph*
  4. `docs/images/shipguard-rovo-mcp-hub.png` — *Rovo Agent (`rovo:agent` + `rovo:skill`) & Atlassian MCP (`rovo:mcp`) Live Tool Hub*
  5. `docs/images/shipguard-confluence-verifier.png` — *Confluence Runbook Verifier 5-Point Operational Checklist & Freshness SLA*

---

## 2. Full Marketplace Description (Copy-Paste)

**Build with context. Ship with confidence.**

Software teams merge pull requests and trigger releases dozens of times per day — yet critical release-safety signals remain scattered across Jira blockers, stale Confluence runbooks, active SEV-1/SEV-2 incidents, and cross-service Teamwork Graph dependencies.

**ShipGuard** unites your entire Atlassian operational graph into a deterministic, instant pre-ship safety gate directly inside **Jira**, **Confluence**, **Atlassian Rovo**, and external **IDE coding agents via Atlassian MCP**.

### 3 Value Highlights

1. **Deterministic 0–100 Release Readiness & Incident Collision Guard**
   - Automatically scores every Jira release candidate across 5 weighted dimensions: Jira Dependencies, Confluence Runbook Freshness, Active Incident Collisions, Teamwork Graph Blast Radius, and Change Drift Governance.
   - Fires configurable hard ship-block gates stored in `@forge/kvs` whenever an active SEV-1 incident overlaps with impacted components/services or an inward Jira blocker remains unresolved.
2. **One-Click Operational Remediation Inside Jira & Confluence**
   - Visualize linked blockers, active incidents, Confluence runbooks, owning Atlassian Teams, PRs, and impacted services on an interactive **Blast-Radius Map**.
   - Generate a 100/100 compliant **Confluence Rollback Runbook Stub** in one click, post structured readiness audits to Jira, verify any Confluence page via **`•••` → Verify Runbook with ShipGuard**, and log auditable override decisions in Forge KVS.
3. **Native Rovo Agent, Reusable Skill & IDE Atlassian MCP Server**
   - Ask **ShipGuard Release Guardian** (`rovo:agent` + `rovo:skill`) *"Is PAY-412 safe to ship right now?"* inside Jira or Confluence.
   - Expose all 5 ShipGuard verification tools through **`rovo:mcp`** + our open-source `SKILL.md` so developers using Cursor, Claude Code, Antigravity, or VS Code catch live Atlassian SEV-1 collisions and missing runbooks *before* merging a PR.

---

## 3. Security, Privacy & "Runs on Atlassian" Statement (Copy-Paste)

- **100% Runs on Atlassian Forge (`nodejs24.x`):** All backend logic, deterministic scoring, UI assets, and storage run entirely inside Atlassian's Forge platform infrastructure.
- **Zero External Network Egress:** ShipGuard declares **no** `external.fetch` permissions — zero Jira, Confluence, Incident, or Teamwork Graph data ever leaves your Atlassian Cloud boundary.
- **Zero Paid Forge LLM / Third-Party AI Calls:** ShipGuard uses 100% deterministic Forge scoring logic combined with native Atlassian Rovo orchestration (`rovo:agent`, `rovo:skill`, `rovo:mcp`) — no third-party LLM keys or external inference endpoints.
- **Data Storage & Retention:** Only lightweight project policy thresholds (`policy:<projectKey>`), human-confirmed decision audit records (`decisions:<issueKey>`), drift snapshots (`drift:<issueKey>`), and demo-seeder metadata (`demo-seed:<projectKey>`) are stored inside tenant-isolated Forge Key-Value Storage (`@forge/kvs`). Uninstalling the app removes all tenant app access immediately.
- **Permissions Least-Privilege:** Uses standard Jira REST v3, Confluence REST v2, Forge KVS (`storage:app`), and granular read-only Teamwork Graph scopes (`read:graph:*`). No destructive delete scopes are requested.

---

## 4. Atlassian Marketplace Reviewer Testing Instructions (Copy-Paste)

1. Install **ShipGuard — Release Context & Blast-Radius Guardian** on your Atlassian Cloud test site (Jira + Confluence + Rovo).
2. Open any Jira project → select **ShipGuard Release Center** in the project navigation.
3. **Zero-Setup 1-Click Demo Seeder:** Click **Seed Live Demo Scenario (1 Click)** inside the Guided Onboarding banner (or top header). ShipGuard idempotently creates 4 `[ShipGuard Demo]` Jira issues (a blocked critical story, an unresolved blocking task linked via `Blocks`, an active SEV-1 incident sharing labels/services, and a clean green-light story) plus Confluence runbook stubs (gracefully skipping Confluence if space write access is restricted).
4. Verify:
   - **Jira Release Center:** Confirm both **BLOCK** and **GO** verdicts appear along with the active SEV-1 collision banner.
   - **Jira Issue Panel:** Click **Inspect** or open the `[ShipGuard Demo]` blocked story → **Apps → ShipGuard Readiness** → explore the Readiness Gauge, **Blast-Radius Map** tab, **Generate Rollback Runbook Stub**, **Post Readiness Audit to Jira**, and **Record Decision / Override**.
   - **Team Policy (KVS):** Switch to **Team Ship-Gate Policy (KVS)**, update a threshold, save, and confirm live recalculation.
   - **Confluence Runbook Verifier:** Open any Confluence page → **`•••` → Verify Runbook with ShipGuard** to inspect the 5-point operational checklist.
   - **Rovo Agent & MCP:** Open **Rovo Chat** → select **ShipGuard Release Guardian** → ask *"Rank release risks across project `<YOUR_PROJECT_KEY>`"*.

---

## 5. Marketplace Submission Checklist (5-Minute Workflow)

1. Deploy production build (`npm run build && npx forge lint && npx forge deploy -e production`).
2. In Atlassian Developer Console → **Distribution** → enable **Sharing** and copy your Forge App ID.
3. Open **Atlassian Marketplace Partner Portal**: `https://marketplace.atlassian.com/manage/apps/create`
4. Link your Forge App ID, paste sections 1–4 above, upload `docs/assets/shipguard-logo.png` and `docs/images/shipguard-*.png`, and submit your listing ticket!
5. Include your Marketplace listing / review ticket URL in your Codegeist 2026 Devpost submission form.
