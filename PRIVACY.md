# Privacy Policy — ShipGuard Release Guardian

**Last Updated:** November 22, 2026  
**Developer:** NoOneAhead (`https://github.com/NoOneAhead/shipguard`)  
**Contact:** https://github.com/NoOneAhead/shipguard/issues

## 1. Overview & Runs on Atlassian Architecture
**ShipGuard Release Guardian** is a 100% **Runs on Atlassian** Forge application (`nodejs24.x`). All execution, scoring logic, UI assets, and storage remain strictly inside Atlassian's hosted Forge cloud infrastructure.

## 2. Zero External Network Egress & Zero Third-Party AI Calls
- ShipGuard declares **no** external network egress (`external.fetch` is empty).
- No Jira issues, Confluence pages, incident records, Teamwork Graph data, or user information ever leave your Atlassian Cloud boundary.
- ShipGuard does not transmit tenant data to any external server, analytics provider, or third-party LLM endpoint. All scoring is deterministic inside Forge, and AI orchestration uses native Atlassian Rovo (`rovo:agent`, `rovo:skill`, `rovo:mcp`).

## 3. Data Accessed & Stored
ShipGuard accesses Jira issues, Confluence pages, and Teamwork Graph relationships strictly on demand within the permissions granted during app installation:
- **Forge Key-Value Storage (`@forge/kvs`)**: Stores only lightweight, tenant-isolated operational metadata inside Atlassian's Forge storage:
  - Project policy thresholds (`policy:<projectKey>`)
  - Readiness drift score snapshots (`drift:<issueKey>`)
  - User-confirmed release governance entries (`decisions:<issueKey>`)
  - Demo-seeder idempotency state (`demo-seed:<projectKey>`)
- ShipGuard does **not** copy or store Atlassian user `accountId`s or personal data in external systems.

## 4. Data Retention & Deletion
All app-managed operational metadata resides solely in your Atlassian tenant's Forge Storage. Uninstalling ShipGuard from your Atlassian site immediately revokes all app access, and tenant storage follows Atlassian Forge's standard data retention and deletion lifecycle.

## 5. Contact
For privacy or security questions, open an issue at https://github.com/NoOneAhead/shipguard/issues.
