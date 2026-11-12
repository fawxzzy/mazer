import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

// Normalise CRLF so checkouts with core.autocrlf behave like CI.
const readRepoFile = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');

describe('visual evidence governance contract (MAZER-GOV-005, MAZER-2D-001)', () => {
  test('PR template asks for visual evidence or N/A and points at the playbook', () => {
    const template = readRepoFile('.github/pull_request_template.md');

    expect(template).toMatch(/- \[ \] Visual change: evidence path/);
    expect(template).toContain('or N/A');
    expect(template).toContain('docs/PLAYBOOK_VISUAL_EVIDENCE.md');
  });

  test('AGENTS.md points at the visual evidence playbook', () => {
    const agents = readRepoFile('AGENTS.md');

    expect(agents).toContain('docs/PLAYBOOK_VISUAL_EVIDENCE.md');
    expect(existsSync(resolve(process.cwd(), 'docs/PLAYBOOK_VISUAL_EVIDENCE.md'))).toBe(true);
  });

  test('every test path AGENTS.md cites as authority exists', () => {
    const agents = readRepoFile('AGENTS.md');
    const authorityLine = agents.split('\n').find((line) => line.includes('prefer `docs/current-truth.md`')) ?? '';
    const cited = [...authorityLine.matchAll(/`(tests\/[^`]+)`/g)].map((match) => match[1]);

    expect(cited.length).toBeGreaterThan(0);
    for (const path of cited) {
      expect(existsSync(resolve(process.cwd(), path)), `${path} must exist`).toBe(true);
    }
    expect(authorityLine).not.toContain('`tests/scenes/demo-build.test.ts`');
  });

  test('artifacts/visual/README.md marks baseline.json as archival', () => {
    const readme = readRepoFile('artifacts/visual/README.md');

    expect(readme).toContain('Archival pointer');
    expect(readme).toContain('artifacts/visual/baseline.json');
    expect(readme).toContain('2026-04-16');
    expect(existsSync(resolve(process.cwd(), 'artifacts/visual/baseline.json'))).toBe(true);
  });
});
