# ShipGuard — IDE & Coding Agent MCP Integration Pack (`rovo:mcp` + `SKILL.md`)

ShipGuard exposes all **5 deterministic pre-ship verification tools** through Atlassian's Forge **`rovo:mcp`** module (`shipguard-mcp-server`) paired with our open-source agent skill ([`../skills/shipguard-release-check/SKILL.md`](../skills/shipguard-release-check/SKILL.md)).

This enables AI coding agents (**Cursor**, **Claude Code**, **Antigravity**, and **VS Code**) to verify live **Jira dependencies**, **active SEV-1/SEV-2 incidents**, **Confluence runbook freshness**, and **Teamwork Graph blast radius** straight from the developer's IDE before merging a pull request.

---

## Exposed Atlassian MCP Tools (`rovo:mcp`)

| Tool Key | Verb | Inputs | Purpose |
| :--- | :---: | :--- | :--- |
| `evaluate-ship-readiness` | `GET` | `{ "issueKey": "PAY-412" }` | Full 0–100 score, `GO`/`CAUTION`/`BLOCK` verdict, hard-block gates, 5 risk dimensions, incident collisions, runbook audits, and Teamwork Graph services. |
| `check-incident-collisions` | `GET` | `{ "issueKey": "PAY-412" }` | Scans open SEV-1/SEV-2 incidents colliding with issue components, labels, or Teamwork Graph services. |
| `audit-runbook-freshness` | `GET` | `{ "pageId": "CONF-101" }` or `{ "issueKey": "PAY-412" }` | Verifies Confluence runbook freshness SLA and 5 mandatory operational sections (Rollback, Monitoring, Health Checks, Escalation, Post-Deploy Verification). |
| `get-project-release-risk` | `GET` | `{ "projectKey": "PAY" }` | Ranks every active release candidate in a Jira project by ship risk. |
| `record-ship-decision` | `CREATE` | `{ "issueKey", "decision", "justification", "actorName?" }` | Persists a **human-confirmed** `APPROVED` / `OVERRIDDEN` / `HELD` governance decision in Forge KVS and posts a Jira audit comment. |

---

## Step 1: Connect Your IDE to the Atlassian MCP Server

Once **ShipGuard** is installed on your Atlassian Cloud site (see [`../DEPLOY_GUIDE.md`](../DEPLOY_GUIDE.md)), connect your IDE client to the official **Atlassian Remote MCP Server** (`https://mcp.atlassian.com/v1/mcp`), which automatically surfaces every `rovo:mcp` tool from installed Forge apps alongside your site's Jira/Confluence permissions.

### Cursor (`.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "atlassian-shipguard": {
      "url": "https://mcp.atlassian.com/v1/mcp"
    }
  }
}
```
Copy the skill file into `.cursor/skills/shipguard-release-check/SKILL.md` (or `.cursor/rules/`).

### Claude Code (CLI / `.mcp.json`)
```bash
claude mcp add --transport http atlassian-shipguard https://mcp.atlassian.com/v1/mcp
```
Or commit `.mcp.json` at repo root:
```json
{
  "mcpServers": {
    "atlassian-shipguard": {
      "type": "http",
      "url": "https://mcp.atlassian.com/v1/mcp"
    }
  }
}
```
Copy [`../skills/shipguard-release-check/SKILL.md`](../skills/shipguard-release-check/SKILL.md) to `.claude/skills/shipguard-release-check/SKILL.md`.

### Antigravity (MCP Config + Workspace Skill)
Add to your Antigravity MCP server configuration:
```json
{
  "mcpServers": {
    "atlassian-shipguard": {
      "serverUrl": "https://mcp.atlassian.com/v1/mcp"
    }
  }
}
```
Place [`../skills/shipguard-release-check/SKILL.md`](../skills/shipguard-release-check/SKILL.md) in `.agent/skills/shipguard-release-check/SKILL.md` (or `~/.gemini/antigravity/skills/shipguard-release-check/SKILL.md`).

### VS Code (`.vscode/mcp.json`)
```json
{
  "servers": {
    "atlassian-shipguard": {
      "type": "http",
      "url": "https://mcp.atlassian.com/v1/mcp"
    }
  }
}
```
Place [`../skills/shipguard-release-check/SKILL.md`](../skills/shipguard-release-check/SKILL.md) in `.github/skills/shipguard-release-check/SKILL.md`.

---

## Step 2: Example Pre-Merge IDE Agent Workflow

**Developer prompt in IDE:**
> *"Before I merge PR #712 for `PAY-412`, run the `shipguard-release-check` skill to verify if it's safe to ship."*

**1. Coding agent invokes `evaluate-ship-readiness({ "issueKey": "PAY-412" })` via Atlassian MCP:**
```json
{
  "ok": true,
  "issueKey": "PAY-412",
  "summary": "Switch Checkout Webhook Signing to Dual-Key HMAC Rotation",
  "score": 30,
  "verdict": "BLOCK",
  "blastRadiusTier": "CRITICAL",
  "hardBlockReasons": [
    "1 unresolved blocker(s): PAY-408",
    "Active SEV-1 collision (INC-889) on component:checkout-webhooks, service:checkout-webhooks, service:payment-gateway, label:payments, label:webhooks"
  ],
  "incidentCollisions": [
    {
      "key": "INC-889",
      "severity": "SEV-1",
      "status": "Investigating",
      "matchedOn": ["component:checkout-webhooks", "service:checkout-webhooks", "service:payment-gateway"]
    }
  ],
  "runbooks": [
    {
      "pageId": "CONF-101",
      "title": "Checkout Webhooks Production Deployment Guide",
      "score": 17,
      "status": "STALE_OR_INCOMPLETE",
      "ageDays": 74,
      "missingSections": ["Rollback Procedure", "Health Checks & Smoke Tests", "On-Call Owner & Escalation"]
    }
  ],
  "teamworkGraphSource": "TEAMWORK_GRAPH_API",
  "impactedServices": ["checkout-webhooks", "payment-gateway", "merchant-callback-router", "eu-edge-ingress"]
}
```

**2. Coding agent follows `SKILL.md` guardrails and stops the unsafe merge:**
> **HOLD MERGE — `PAY-412` Verdict: `BLOCK` (Score 30/100 · `CRITICAL` Blast Radius)**
> - **Hard Gate 1:** Active `SEV-1` incident **`INC-889`** is currently *Investigating* on `checkout-webhooks` and `payment-gateway` (Commander: Devon Brooks).
> - **Hard Gate 2:** Unresolved blocker **`PAY-408`** (*Provision Secondary KMS Signing Key in EU-West Vault*) is still *In Progress*.
> - **Runbook Gap:** Linked Confluence runbook **`CONF-101`** is **74 days stale** (SLA: 45d) and missing a **Rollback Procedure**, **Health Checks**, and **On-Call Escalation**.
> - **Next Steps:** Hold merge until `INC-889` stabilizes and `PAY-408` closes, or generate a compliant rollback runbook stub in ShipGuard. *(No override recorded — explicit human confirmation required.)*

---

## Test All 5 MCP Tools Locally Right Now (Zero Cloud Auth Needed)

Run the standalone local preview server and exercise every MCP tool live in the **Rovo Agent & Atlassian MCP Hub** tab or via `curl`:

```bash
npm run preview
```

```bash
curl -X POST http://127.0.0.1:4173/api/rovo/evaluate-ship-readiness \
  -H "Content-Type: application/json" \
  -d '{"issueKey":"PAY-412"}'
```
