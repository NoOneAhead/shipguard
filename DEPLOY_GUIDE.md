# ShipGuard — Forge Deployment, Demo-Site Sharing & Marketplace Guide

Follow these exact steps to register, deploy, test, and share **ShipGuard** for your **Codegeist 2026** submission.

---

## Prerequisites

1. **Node.js Version for `@forge/cli@15.1.0`**
   - Atlassian's Forge CLI v15 requires **Node.js `^22.23.4` or `^24.22.1`+** (if your local machine has Node `v24.14.0`, upgrade to Node `v24.22.1+` or switch via `nvm use 22` / `nvm install 24`).
   - Verify with:
     ```bash
     node -v
     npx forge --version
     ```
2. **Atlassian Account & API Token**
   - Create a Forge API token at: `https://id.atlassian.com/manage-profile/security/api-tokens`

---

## Step 1: Authenticate with Forge CLI

```bash
cd C:\Users\Administrator\.gemini\antigravity\scratch\codegeist-2026
npx forge login
```
Enter your Atlassian account email and paste your API token.

---

## Step 2: Register ShipGuard Under Your Developer Account

`manifest.yml` ships with a placeholder `app.id` (`ari:cloud:ecosystem::app/00000000-0000-0000-0000-000000000000`). Run `forge register` to assign your real Atlassian App ARI:

```bash
npx forge register "ShipGuard Release Guardian"
```
This automatically updates `app.id` in `manifest.yml`.

---

## Step 3: Build, Lint & Deploy to Forge

```bash
npm run build
npm run lint:manifest
npx forge lint
npx forge deploy -e production
```
*(You can also deploy to `-e development` first while iterating, then promote/deploy to `-e production` before generating your public judge installation link.)*

---

## Step 4: Provision a Free Codegeist Demo Site & Install ShipGuard

Atlassian provides a dedicated demo site pre-loaded with enterprise **Jira**, **Confluence**, **Jira Service Management**, and **Rovo**:

```bash
npx forge site provision
npx forge install --demo-site --environment production
```

> **Note on Teamwork Graph Scopes:** Because ShipGuard declares Teamwork Graph scopes (`read:graph:issue:jira`, `read:graph:page:confluence`, `read:graph:user:atlassian`, `read:graph:team:atlassian`, `read:graph:pull-request:external`, `read:graph:service:external`), install as an **organization admin** (which your provisioned demo site grants you automatically). ShipGuard installs across **Jira**, **Confluence**, and **Rovo** cleanly.

Verify the installation by opening your provisioned demo site URL (`https://<your-demo-site>.atlassian.net`):
1. Open any Jira issue → click **Apps → ShipGuard Readiness** to open the Issue Panel.
2. Open any Jira project → click **ShipGuard Release Center** in project navigation.
3. Open any Confluence page → click **`•••` (More actions) → Verify Runbook with ShipGuard**.
4. Open **Rovo Chat** → select **ShipGuard Release Guardian** and click a conversation starter.

---

## Step 5: Generate the Judge Testing Installation Link (Required by Codegeist)

1. Open the **Atlassian Developer Console**: `https://developer.atlassian.com/console/myapps/`
2. Select **ShipGuard Release Guardian**.
3. Go to **Distribution** in the left sidebar.
4. Click **Edit** → switch Distribution status to **Sharing** (**Start sharing your app**).
5. Fill in the required contact / privacy policy URLs and save.
6. Copy the generated **Installation link** (`https://developer.atlassian.com/console/install/...`) and paste it into your Codegeist Devpost submission!

---

## Step 6: Connect IDE Coding Agents via Atlassian MCP + `SKILL.md`

1. In your Atlassian site (where ShipGuard is installed), enable **Atlassian MCP Server** access for your coding agent (Cursor, Claude Code, Antigravity, or VS Code) following Atlassian's Rovo MCP setup docs (`https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-mcp/`).
2. Confirm the **ShipGuard MCP Server** tools appear:
   - `evaluate-ship-readiness`
   - `check-incident-collisions`
   - `audit-runbook-freshness`
   - `record-ship-decision`
   - `get-project-release-risk`
3. Copy `skills/shipguard-release-check/SKILL.md` into your repository or agent skills directory so coding agents automatically run the full pre-ship check workflow before merging PRs.

---

## Step 7 (Optional — 4th Stackable Bonus Prize): Submit to Atlassian Marketplace (5-Minute Ticket!)

To qualify for the **Best Marketplace published app ($1,500 × 6)** bonus prize, use the ready-to-paste copy, privacy statement, reviewer instructions, and 512×512 PNG logo bundled in **[`MARKETPLACE_KIT.md`](MARKETPLACE_KIT.md)**:
1. Ensure your app is deployed to `production` with clean `forge lint` and Distribution set to **Sharing**.
2. Visit the **Atlassian Marketplace Partner Portal** (`https://marketplace.atlassian.com/manage/apps/create`) and create a free app listing linked to your Forge App ID.
3. Paste the listing title, tagline, 3 value highlights, *"100% Runs on Atlassian / zero external egress / zero paid Forge LLMs"* security statement, and reviewer testing instructions (featuring the 1-Click Live Demo Seeder!) straight from `MARKETPLACE_KIT.md`.
4. Upload `docs/assets/shipguard-logo.png` (512×512) and the gallery screenshots from `docs/images/`, and submit the Marketplace listing ticket before **Dec 22, 2026 @ 12:00 pm PT**.
