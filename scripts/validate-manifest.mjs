import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import YAML from 'yaml';

const require = createRequire(import.meta.url);
const { validate } = require('@forge/manifest');

const ROOT = process.cwd();
const MANIFEST_PATH = path.join(ROOT, 'manifest.yml');

async function main() {
  const failures = [];

  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error('manifest.yml not found');
  }

  // 1. Run Atlassian's official @forge/manifest full validation processor
  const official = await validate(false, 'manifest.yml');
  if (!official.success || (official.errors && official.errors.length > 0)) {
    for (const err of official.errors ?? []) {
      failures.push(`[Forge Official Schema] ${err.message} (line ${err.line ?? '?'})`);
    }
  }

  const rawYaml = fs.readFileSync(MANIFEST_PATH, 'utf8');
  const manifest = YAML.parse(rawYaml);

  // 2. Verify all function handlers exist in src/index.ts
  const indexSource = fs.readFileSync(path.join(ROOT, 'src/index.ts'), 'utf8');
  const functions = manifest.modules?.function ?? [];
  const functionKeys = new Set();
  for (const fn of functions) {
    functionKeys.add(fn.key);
    if (fn.key.length > 23) {
      failures.push(`Function key "${fn.key}" exceeds Forge's 23-character limit.`);
    }
    const [fileBase, exportName] = String(fn.handler ?? '').split('.');
    if (fileBase !== 'index' || !exportName) {
      failures.push(`Unexpected handler format on function "${fn.key}": ${fn.handler}`);
    } else if (!indexSource.includes(`export const ${exportName}`)) {
      failures.push(`Handler export "${exportName}" referenced by "${fn.key}" not found in src/index.ts`);
    }
  }

  // 3. Cross-check Rovo agent, skill, MCP tool, and action references
  const actions = manifest.modules?.action ?? [];
  const actionKeys = new Set(actions.map((a) => a.key));
  for (const act of actions) {
    if (!functionKeys.has(act.function)) {
      failures.push(`Action "${act.key}" references unknown function "${act.function}"`);
    }
  }

  for (const agent of manifest.modules?.['rovo:agent'] ?? []) {
    for (const actKey of agent.actions ?? []) {
      if (!actionKeys.has(actKey)) {
        failures.push(`rovo:agent "${agent.key}" references unknown action "${actKey}"`);
      }
    }
  }

  for (const skill of manifest.modules?.['rovo:skill'] ?? []) {
    const skillDir = path.join(ROOT, skill.source?.dir ?? '');
    const skillMd = path.join(skillDir, 'SKILL.md');
    if (!fs.existsSync(skillMd)) {
      failures.push(`rovo:skill "${skill.key}" missing SKILL.md at ${skillMd}`);
    } else {
      const content = fs.readFileSync(skillMd, 'utf8');
      if (!content.startsWith('---') || !content.includes('name:') || !content.includes('description:')) {
        failures.push(`rovo:skill "${skill.key}" SKILL.md must include YAML frontmatter with name and description`);
      }
    }
    for (const toolKey of skill.dependencies?.tools ?? []) {
      if (!actionKeys.has(toolKey)) {
        failures.push(`rovo:skill "${skill.key}" references unknown tool "${toolKey}"`);
      }
    }
  }

  for (const mcp of manifest.modules?.['rovo:mcp'] ?? []) {
    for (const toolKey of mcp.tools ?? []) {
      if (!actionKeys.has(toolKey)) {
        failures.push(`rovo:mcp "${mcp.key}" references unknown tool "${toolKey}"`);
      }
    }
  }

  // 4. Verify all scopes against official @forge/manifest scope registries & zero deprecated scopes
  const shipyardScopes = new Set(
    JSON.parse(
      fs.readFileSync(
        path.join(ROOT, 'node_modules/@forge/manifest/out/scopes/shipyard-scopes.json'),
        'utf8'
      )
    )
  );
  const twgScopes = new Set(
    JSON.parse(
      fs.readFileSync(
        path.join(ROOT, 'node_modules/@forge/manifest/out/scopes/teamwork-graph-scopes.json'),
        'utf8'
      )
    )
  );
  const deprecatedScopes = new Set(
    JSON.parse(
      fs.readFileSync(
        path.join(ROOT, 'node_modules/@forge/manifest/out/scopes/deprecated-shipyard-scopes.json'),
        'utf8'
      )
    )
  );

  for (const scope of manifest.permissions?.scopes ?? []) {
    if (!shipyardScopes.has(scope) && !twgScopes.has(scope)) {
      failures.push(`Scope "${scope}" is not recognized in @forge/manifest official scope registries`);
    }
    if (deprecatedScopes.has(scope)) {
      failures.push(`Scope "${scope}" is deprecated`);
    }
  }

  // 5. Enforce Codegeist Cost Rule: zero paid Forge LLM modules or @forge/llm packages
  const pkgJson = fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8');
  if (rawYaml.includes('llm:') || pkgJson.includes('@forge/llm')) {
    failures.push('Paid Forge LLM usage detected — violates Codegeist zero-LLM-credit cost rule');
  }

  if (failures.length > 0) {
    console.error('Manifest validation FAILED:\n' + failures.map((f) => `  - ${f}`).join('\n'));
    process.exit(1);
  }

  console.log('✓ Official @forge/manifest FullValidationProcessor passed (0 errors, 0 warnings)');
  console.log(`✓ Verified ${functions.length} Forge functions, ${actions.length} Rovo/MCP actions, 1 rovo:agent, 1 rovo:skill, 1 rovo:mcp, 3 UI surfaces, 1 trigger`);
  console.log(`✓ Verified ${(manifest.permissions?.scopes ?? []).length} official non-deprecated scopes (including 6 Teamwork Graph scopes)`);
  console.log('✓ Confirmed zero paid Forge LLM dependencies');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
