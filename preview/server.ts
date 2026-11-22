import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MockAtlassianClient } from '../src/adapters/mockAtlassianClient';
import { createResolverHandlers } from '../src/handlers/resolver';
import { createRovoActionHandlers } from '../src/handlers/rovoActions';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, '../static/shipguard-ui/dist');
const PORT = Number(process.env.PORT ?? 4173);
const HOST = process.env.HOST ?? '127.0.0.1';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon'
};

export function createPreviewServer() {
  const mockClient = new MockAtlassianClient();
  const resolverHandlers = createResolverHandlers(mockClient);
  const rovoHandlers = createRovoActionHandlers(mockClient);

  const rovoToolMap: Record<string, (payload: any) => Promise<any>> = {
    'evaluate-ship-readiness': rovoHandlers.evaluateShipReadinessAction,
    'check-incident-collisions': rovoHandlers.checkIncidentCollisionsAction,
    'audit-runbook-freshness': rovoHandlers.auditRunbookFreshnessAction,
    'record-ship-decision': rovoHandlers.recordShipDecisionAction,
    'get-project-release-risk': rovoHandlers.getProjectReleaseRiskAction
  };

  const server = http.createServer(async (req, res) => {
    try {
      const urlObj = new URL(req.url ?? '/', `http://${HOST}:${PORT}`);
      const pathname = urlObj.pathname;

      if (pathname === '/api/health') {
        sendJson(res, 200, { ok: true, app: 'ShipGuard Preview Server' });
        return;
      }

      if (pathname === '/api/preview/seed' && req.method === 'GET') {
        const [issues, pages] = await Promise.all([
          mockClient.listProjectReleaseCandidates('PAY', 20),
          mockClient.listAllConfluencePages()
        ]);
        sendJson(res, 200, {
          projectKey: 'PAY',
          issues: issues.map((i) => ({ key: i.key, summary: i.summary })),
          pages: pages.map((p) => ({ id: p.id, title: p.title, spaceKey: p.spaceKey }))
        });
        return;
      }

      if (pathname === '/api/preview/mode' && req.method === 'POST') {
        const body = await readJsonBody(req);
        if (body.mode === 'empty') {
          mockClient.clearForEmptySiteMode('PAY');
        } else if (body.mode === 'reset') {
          mockClient.resetDefaultSeededWorkspace();
        }
        sendJson(res, 200, { ok: true, mode: body.mode });
        return;
      }

      if (pathname.startsWith('/api/invoke/') && req.method === 'POST') {
        const fnKey = decodeURIComponent(pathname.slice('/api/invoke/'.length));
        const handler = (resolverHandlers as Record<string, any>)[fnKey];
        if (!handler) {
          sendJson(res, 404, { error: `Unknown resolver function: ${fnKey}` });
          return;
        }
        const payload = await readJsonBody(req);
        const result = await handler({
          payload,
          context: {
            extension: {
              issue: { key: payload?.issueKey ?? 'PAY-412' },
              project: { key: payload?.projectKey ?? 'PAY' },
              content: { id: payload?.pageId ?? 'CONF-101' }
            }
          }
        });
        sendJson(res, 200, result);
        return;
      }

      if (pathname.startsWith('/api/rovo/') && req.method === 'POST') {
        const toolKey = decodeURIComponent(pathname.slice('/api/rovo/'.length));
        const handler = rovoToolMap[toolKey];
        if (!handler) {
          sendJson(res, 404, { error: `Unknown Rovo/MCP action: ${toolKey}` });
          return;
        }
        const inputs = await readJsonBody(req);
        const result = await handler({ inputs });
        sendJson(res, 200, result);
        return;
      }

      // Serve static Custom UI build
      const safePath = pathname === '/' ? '/index.html' : pathname;
      const fullPath = path.resolve(DIST_DIR, `.${safePath}`);
      if (!fullPath.startsWith(DIST_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      const fileToServe =
        fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()
          ? fullPath
          : path.join(DIST_DIR, 'index.html');

      if (!fs.existsSync(fileToServe)) {
        sendJson(res, 503, {
          error: 'UI bundle not built yet. Run "npm run build:ui" first.'
        });
        return;
      }

      const ext = path.extname(fileToServe).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream' });
      fs.createReadStream(fileToServe).pipe(res);
    } catch (err: any) {
      sendJson(res, 500, { error: err?.message ?? 'Internal preview server error' });
    }
  });

  return server;
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, any>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]).toLowerCase() ===
    path.resolve(fileURLToPath(import.meta.url)).toLowerCase();

if (isMain) {
  const server = createPreviewServer();
  server.listen(PORT, HOST, () => {
    console.log(`\nShipGuard Local Preview Server running at http://${HOST}:${PORT}`);
    console.log(`  - Release Command Center: http://${HOST}:${PORT}/?surface=project`);
    console.log(`  - Jira Issue Panel (PAY-412): http://${HOST}:${PORT}/?surface=issue&issueKey=PAY-412`);
    console.log(`  - Confluence Runbook Verifier (CONF-101): http://${HOST}:${PORT}/?surface=confluence&pageId=CONF-101\n`);
  });
}
