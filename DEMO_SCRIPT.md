# ShipGuard — Codegeist 2026 Demo Video Script (< 5 Minutes)

- **Target Runtime:** 4 minutes 30 seconds (strictly under the 5-minute Codegeist limit)
- **Format:** 1080p screen recording + crisp voiceover (English)
- **Key Proof Points Covered:** Problem & Impact → Live Jira Release Center → Issue Panel & Blast-Radius Map → One-Click Confluence Remediation & KVS Policy/Override → Confluence Runbook Verifier → Rovo Agent (`rovo:agent` + `rovo:skill`) → IDE Coding Agent via Atlassian MCP (`rovo:mcp` + `SKILL.md`)

---

## [0:00 – 0:35] Hook & The Problem
- **Visual:** Split-screen title card: *"ShipGuard — Build with context. Ship with confidence."* Transition directly to the **ShipGuard Release Command Center** inside Jira (`PAY` — Payments & Checkout Platform).
- **Voiceover:**
  > "Every engineering team knows the nightmare of a Friday deploy that shouldn't have shipped. A developer merges a PR in seconds — never realizing an active SEV-1 incident is already hitting that service, a blocking Jira task is still open, and the Confluence rollback runbook is 74 days stale and missing rollback steps.  
  > Meet **ShipGuard** — an Atlassian Forge app that unifies live Jira, Confluence, Incident, and Teamwork Graph context into a deterministic pre-ship safety gate inside Jira, Confluence, Rovo, and right inside your developer IDE via Atlassian MCP."

---

## [0:35 – 1:20] 1-Click Live Demo Seeder, Jira Project Release Command Center & KVS Policy
- **Visual:** Show how effortless onboarding is on a fresh Jira site:
  1. Flash the **Fresh Site Quickstart** banner (1–2s) and click **⚡ Seed Live Demo Scenario (1 Click)** — instantly populating the blocked critical story, blocker link, active SEV-1 collision incident, green-light GO story, and Confluence runbooks.
  2. Pan across the populated **ShipGuard Release Command Center** (`jira:projectPage`): highlight the red **Active Production Incidents Detected** collision banner (`INC-889` SEV-1 on `checkout-webhooks` and `INC-894` SEV-2 on `ledger-worker`), KPI cards (`2 Block · 2 Caution · 2 Go`), and risk-ranked candidate table.
  3. Briefly click **Team Ship-Gate Policy (KVS)** to show team-configurable GO/CAUTION thresholds, freshness SLA, and hard-block toggles stored in `@forge/kvs`.
- **Voiceover:**
  > "Installing ShipGuard on any Jira site takes seconds — even on an empty test site, our idempotent **One-Click Live Demo Seeder** populates a realistic release train so teams and judges can test immediately.  
  > Inside the **ShipGuard Release Command Center**, our deterministic 5-dimension Forge engine — using zero paid LLM credits — ranks every candidate against `@forge/kvs` team policies, immediately surfacing blocked tickets, active SEV-1/SEV-2 collisions, and green-light releases."

---

## [1:20 – 2:25] Jira Issue Panel, Blast-Radius Map & One-Click Fix
- **Visual:** Click **Inspect** on **`PAY-412`** (*Switch Checkout Webhook Signing to Dual-Key HMAC Rotation*) to open the **Jira Issue Panel** (`jira:issuePanel`):
  1. Show the animated **Readiness Gauge (BLOCK · CRITICAL BLAST)** and the **Hard Ship-Gate Blockers** banner (`PAY-408` unresolved blocker + `INC-889` active SEV-1 collision on `checkout-webhooks`).
  2. Scroll past the 5 weighted dimension cards and prioritized remediation findings.
  3. Click the **Blast-Radius Map** tab — show the interactive SVG graph connecting `PAY-412` to `INC-889`, `PAY-408`, `CONF-101`, Teamwork Graph owning teams (`Checkout Core Engineering`), `PR-712` (`CHANGES_REQUESTED`), and 4 impacted services. Click the `INC-889` node to show the live Node Inspector.
  4. Switch briefly to **`PAY-428`** (missing runbook) and click **Generate Rollback Runbook Stub** — show the live toast creating a compliant Confluence runbook, linking it to Jira, and raising the readiness score immediately!
  5. Click **Record Decision / Override** on `PAY-412` to show auditable governance persistence in Forge KVS + Jira audit comment.
- **Voiceover:**
  > "Drilling into `PAY-412`, ShipGuard immediately flags a **SHIP BLOCKED** verdict. Two hard gates fired: an active SEV-1 incident (`INC-889`) on `checkout-webhooks` and an open Jira blocker (`PAY-408`).  
  > Switching to the **Blast-Radius Map**, Teamwork Graph context reveals four downstream services, an unapproved PR with requested changes, and a stale runbook.  
  > Best of all, ShipGuard doesn't just complain — it fixes gaps in one click. On `PAY-428`, clicking **Generate Rollback Runbook Stub** creates a 100/100 operational runbook in Confluence, links it to Jira, and recalculates readiness immediately. And if a release lead must override a gate, ShipGuard captures an immutable Forge KVS justification and mirrors it directly to Jira comments."

---

## [2:25 – 3:00] Confluence Runbook Verifier
- **Visual:** Open the **Confluence Runbook Verifier** (`confluence:contentAction`) on **`CONF-101`** (*Checkout Webhooks Production Deployment Guide*):
  1. Show the **STALE (74d > 45d SLA)** badge and the 5-point operational checklist highlighting **MISSING: Rollback Procedure**, **MISSING: Health Checks**, and **MISSING: On-Call Escalation**.
  2. Switch to **`CONF-103`** (*Multi-Currency Invoice Service Runbook*) showing **100/100 SAFE TO SHIP**, all 5 sections green with matched evidence, and linked Jira release candidates (`PAY-425`, `PAY-435`).
- **Voiceover:**
  > "Inside Confluence, authors can run **Verify Runbook with ShipGuard** from the page actions menu. It deterministically audits the page's storage content against five production operational pillars and team freshness SLAs, showing exactly which Jira release tickets depend on that page."

---

## [3:00 – 4:10] Rovo Agent (`rovo:agent` + `rovo:skill`) & IDE Coding Agent via Atlassian MCP (`rovo:mcp` + `SKILL.md`)
- **Visual:**
  1. Open **Rovo Chat** (or the **Rovo Agent & Atlassian MCP Hub** tab) and invoke **ShipGuard Release Guardian**:
     - Prompt: *"Is PAY-412 safe to ship right now?"*
     - Show the live `evaluate-ship-readiness` JSON output returning `verdict: "BLOCK"`, `hardBlockReasons`, `incidentCollisions: ["INC-889"]`, and `impactedServices`.
  2. Switch to the **IDE / Coding Agent** window (Cursor / Antigravity / Claude Code) displaying `skills/shipguard-release-check/SKILL.md` connected to `shipguard-mcp-server` (`rovo:mcp`):
     - Show the coding agent running `evaluate-ship-readiness` and `check-incident-collisions` before merging a PR and warning the developer: *"HOLD MERGE — PAY-412 is BLOCKED due to active SEV-1 INC-889 on checkout-webhooks."*
- **Voiceover:**
  > "ShipGuard extends the exact same five Forge actions to both **Atlassian Rovo** and external AI coding agents.  
  > Our **ShipGuard Release Guardian** Rovo Agent combines `rovo:agent` and a reusable `rovo:skill` so anyone in Jira or Confluence can ask: *'Is PAY-412 safe to ship?'* and get evidence-backed answers grounded in live APIs.  
  > And via Forge's **`rovo:mcp`** module plus our open-source **`SKILL.md`**, developers using Cursor, Claude Code, or Antigravity get live Atlassian blast-radius checks *right inside their IDE* before merging a single line of code."

---

## [4:10 – 4:30] Architecture Recap, Marketplace Readiness & Closing
- **Visual:** Clean summary slide showing ShipGuard's logo (`docs/assets/shipguard-logo.png`):
  - 100% Runs on Atlassian Forge `nodejs24.x` · Zero External Egress · Zero Paid LLM Credits · Official `@forge/manifest` Validated (0 Errors) · Marketplace Listing Kit Ready (`MARKETPLACE_KIT.md`)
  - Modules: `jira:issuePanel` · `jira:projectPage` · `confluence:contentAction` · `rovo:agent` · `rovo:skill` · `rovo:mcp` · `trigger` · Teamwork Graph API · `@forge/kvs`
- **Voiceover:**
  > "ShipGuard runs 100% natively on Atlassian Forge `nodejs24.x` with zero external egress and zero paid LLM credits, bridges Jira, Confluence, Incidents, Teamwork Graph, Rovo, and IDE coding agents via Atlassian MCP, and is packaged ready for Atlassian Marketplace publication.  
  > **ShipGuard: Build with context. Ship with confidence.** Thank you!"
