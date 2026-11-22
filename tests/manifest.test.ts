import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';

const require = createRequire(import.meta.url);
const { validate } = require('@forge/manifest');

describe('Forge manifest.yml official validation', () => {
  it('passes official @forge/manifest FullValidationProcessor with zero errors', async () => {
    const result = await validate(false, 'manifest.yml');
    expect(result.errors ?? []).toEqual([]);
    expect(result.success).toBe(true);
  });

  it('declares Rovo agent, Rovo skill, Atlassian MCP server, Teamwork Graph scopes, and zero paid LLMs', () => {
    const raw = fs.readFileSync(path.resolve('manifest.yml'), 'utf8');
    const manifest = YAML.parse(raw);

    expect(manifest.app.runtime.name).toBe('nodejs24.x');
    expect(manifest.modules['rovo:agent']).toHaveLength(1);
    expect(manifest.modules['rovo:skill']).toHaveLength(1);
    expect(manifest.modules['rovo:mcp']).toHaveLength(1);
    expect(manifest.modules.action).toHaveLength(5);
    expect(manifest.modules['rovo:mcp'][0].tools).toHaveLength(5);

    const scopes: string[] = manifest.permissions.scopes;
    expect(scopes).toContain('storage:app');
    expect(scopes).toContain('read:graph:issue:jira');
    expect(scopes).toContain('read:graph:page:confluence');
    expect(raw).not.toContain('llm:');

    const skillPath = path.resolve(manifest.modules['rovo:skill'][0].source.dir, 'SKILL.md');
    expect(fs.existsSync(skillPath)).toBe(true);
  });
});
