import ts from 'typescript';
import { describe, expect, test } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Rank-vocabulary guard (board card mazer-player-rank-only-progression-display,
 * residual from the 2026-11-05 message audit).
 *
 * Question: the label built by resolveLegacyProgressionPalette in
 * src/legacy-runtime/legacyProgression.ts ('Player Skill Lv ..' / 'AI Skill Lv
 * ..' at the time of the audit) -- does it ever reach a player-facing surface?
 *
 * Audited answer (base 1670c8af): NO. LegacyProgressionPalette.label has no
 * reader. Its only carrier is the `progression` object inside the runtime and
 * visual diagnostics payloads (window.__MAZER_VISUAL_DIAGNOSTICS__ and the
 * data-mazer-visual-diagnostics attribute), which are machine-readable
 * diagnostics, never rendered text or an accessibility name. The in-canvas
 * progression badge is retired (drawLegacyProgressionBadge draws nothing).
 *
 * This guard pins that answer without pinning the label's wording, so the
 * lane that owns legacyProgression.ts can reword the label (for example to
 * 'Rank ..') without touching this test:
 *   1. 'Skill' wording must not appear in any string literal under src/,
 *      except inside resolveLegacyProgressionPalette.
 *   2. Nothing may read `.label` from a palette (no render path can exist).
 *   3. The progression diagnostics object may only flow into the two
 *      diagnostics publishers; the retired badge text objects must stay unwritten.
 *   4. Static entry HTML / CSS / manifest must not contain 'Skill'.
 */

const root = process.cwd();
const normalize = (source: string): string => source.replace(/\r\n?/g, '\n');
const readSource = (path: string): string => normalize(readFileSync(resolve(root, path), 'utf8'));

const MENU = 'src/scenes/MenuScene.ts';
const PROGRESSION = 'src/legacy-runtime/legacyProgression.ts';
const PALETTE_BUILDER = 'resolveLegacyProgressionPalette';

const walk = (dir: string, out: string[]): string[] => {
  for (const entry of readdirSync(resolve(root, dir), { withFileTypes: true })) {
    const child = join(dir, entry.name).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      walk(child, out);
    } else {
      out.push(child);
    }
  }
  return out;
};

const srcFiles = walk('src', []).sort();
const srcCode = srcFiles.filter((file) => /\.(ts|mts|mjs)$/.test(file) && !/\.d\.m?ts$/.test(file));
const textCache = new Map<string, string>();
const text = (file: string): string => {
  const cached = textCache.get(file);
  if (cached !== undefined) {
    return cached;
  }
  const value = readSource(file);
  textCache.set(file, value);
  return value;
};

const parse = (file: string): ts.SourceFile => ts.createSourceFile(file, text(file), ts.ScriptTarget.ES2022, true);

const literalValue = (node: ts.Node): string | null => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
    return node.text;
  }
  return null;
};

/** Names of every enclosing function, method, or variable declaration, innermost first. */
const enclosingNames = (node: ts.Node): string[] => {
  const names: string[] = [];
  for (let parent: ts.Node | undefined = node.parent; parent; parent = parent.parent) {
    if (
      (ts.isFunctionDeclaration(parent) || ts.isMethodDeclaration(parent) || ts.isVariableDeclaration(parent))
      && parent.name
      && ts.isIdentifier(parent.name)
    ) {
      names.push(parent.name.text);
    }
  }
  return names;
};

const enclosingMethod = (node: ts.Node): string | null => {
  for (let parent: ts.Node | undefined = node.parent; parent; parent = parent.parent) {
    if (ts.isMethodDeclaration(parent) && ts.isIdentifier(parent.name)) {
      return parent.name.text;
    }
  }
  return null;
};

// AST parsing of MenuScene.ts is CPU-bound; give it headroom when the whole suite runs in parallel.
const GUARD_TIMEOUT_MS = 30_000;

const SKILL_WORDING = /\bskill\b/i;

describe('rank vocabulary: Skill wording stays out of player-facing surfaces', { timeout: GUARD_TIMEOUT_MS }, () => {
  test("no string literal under src/ contains 'Skill' outside the palette label builder", () => {
    const offenders: string[] = [];
    for (const file of srcCode) {
      if (!/skill/i.test(text(file))) {
        continue;
      }
      const sourceFile = parse(file);
      const visit = (node: ts.Node): void => {
        const value = literalValue(node);
        if (value !== null && SKILL_WORDING.test(value)) {
          const allowed = file === PROGRESSION && enclosingNames(node).includes(PALETTE_BUILDER);
          if (!allowed) {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
            offenders.push(`${file}:${line} ${JSON.stringify(value)}`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }
    expect(
      offenders,
      'Public progression vocabulary is Rank / AI Rank only (card mazer-player-rank-only-progression-display). '
      + "'Skill' wording appeared in a string literal outside the diagnostics label builder. "
      + 'Use Rank wording, or keep the text out of every player-visible surface and extend this allow-list on purpose.'
    ).toEqual([]);
  });

  test('static entry points and styles carry no Skill wording', () => {
    const staticFiles = [
      ...readdirSync(root).filter((name) => name.endsWith('.html')),
      'public/manifest.webmanifest',
      ...srcFiles.filter((file) => /\.(css|html)$/.test(file))
    ].filter((file) => existsSync(resolve(root, file)));
    expect(staticFiles.length).toBeGreaterThan(0);
    const offenders = staticFiles.filter((file) => SKILL_WORDING.test(text(file)));
    expect(offenders, 'Skill wording found in a static player-facing file').toEqual([]);
  });
});

describe('rank vocabulary: the palette label has no render path', { timeout: GUARD_TIMEOUT_MS }, () => {
  test('nothing reads label from a progression palette', () => {
    const readers: string[] = [];
    for (const file of srcCode) {
      if (file === PROGRESSION || !/palette/i.test(text(file))) {
        continue;
      }
      const sourceFile = parse(file);
      const visit = (node: ts.Node): void => {
        if (
          ts.isPropertyAccessExpression(node)
          && node.name.text === 'label'
          && /palette/i.test(node.expression.getText(sourceFile))
        ) {
          readers.push(`${file}:${sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1} ${node.getText(sourceFile)}`);
        }
        if (
          ts.isElementAccessExpression(node)
          && ts.isStringLiteral(node.argumentExpression)
          && node.argumentExpression.text === 'label'
          && /palette/i.test(node.expression.getText(sourceFile))
        ) {
          readers.push(`${file}:${sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1} ${node.getText(sourceFile)}`);
        }
        if (
          ts.isVariableDeclaration(node)
          && ts.isObjectBindingPattern(node.name)
          && node.initializer
          && /palette/i.test(node.initializer.getText(sourceFile))
          && node.name.elements.some((element) => (
            ts.isIdentifier(element.propertyName ?? element.name)
            && (element.propertyName ?? element.name).getText(sourceFile) === 'label'
          ))
        ) {
          readers.push(`${file}:${sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1} ${node.getText(sourceFile)}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }
    expect(
      readers,
      'LegacyProgressionPalette.label gained a reader. The audit found none, so it was diagnostics-only. '
      + 'If it is meant to be shown, it must use Rank wording and be routed through the player-message/rank display contract first.'
    ).toEqual([]);
  });

  test('the label builder lives in legacyProgression.ts and still returns a label field', () => {
    const sourceFile = parse(PROGRESSION);
    let found = false;
    const visit = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === PALETTE_BUILDER) {
        found = true;
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    expect(found, `${PALETTE_BUILDER} moved or was renamed; update this guard and the inventory doc`).toBe(true);
  });

  test('MenuScene only reads colour/tier fields from palettes', () => {
    const sourceFile = parse(MENU);
    const accessed = new Set<string>();
    // MenuScene also has unrelated backdrop palettes. Count an identifier only
    // when it is a named progression palette or a parameter typed as one.
    const isProgressionPaletteIdentifier = (identifier: ts.Identifier): boolean => {
      if (/^(?:progression|player|trail)Palette$/.test(identifier.text)) {
        return true;
      }
      for (let parent: ts.Node | undefined = identifier.parent; parent; parent = parent.parent) {
        if (ts.isMethodDeclaration(parent) || ts.isFunctionDeclaration(parent) || ts.isArrowFunction(parent)) {
          return parent.parameters.some((parameter) => (
            ts.isIdentifier(parameter.name)
            && parameter.name.text === identifier.text
            && parameter.type?.getText(sourceFile) === 'LegacyProgressionPalette'
          ));
        }
      }
      return false;
    };
    const visit = (node: ts.Node): void => {
      if (
        ts.isPropertyAccessExpression(node)
        && ts.isIdentifier(node.expression)
        && isProgressionPaletteIdentifier(node.expression)
      ) {
        accessed.add(node.name.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    expect(accessed.size).toBeGreaterThan(0);
    expect(accessed.has('label')).toBe(false);
    // Every palette field MenuScene touches today is a colour; a new one needs review.
    const colourFields = new Set([
      'badgeColor', 'playerCoreColor', 'playerHaloColor', 'rankColor', 'tier',
      'trailColor', 'trailPulseColor', 'trailPulseEdgeColor'
    ]);
    const unexpected = [...accessed].filter((name) => !colourFields.has(name));
    expect(unexpected, 'MenuScene reads a new palette field; confirm it is not text').toEqual([]);
  });

  test('the progression diagnostics object only flows into the two diagnostics publishers', () => {
    const sourceFile = parse(MENU);
    const sinks: string[] = [];
    const references: string[] = [];
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node)
        && ts.isIdentifier(node.expression)
        && node.expression.text === 'summarizeLegacyProgressionDiagnostics'
      ) {
        const parent = node.parent;
        if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name) && parent.name.text === 'progression') {
          sinks.push(`progression@${enclosingMethod(node)}`);
        } else if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
          sinks.push(`var:${parent.name.text}@${enclosingMethod(node)}`);
        } else {
          sinks.push(`other@${enclosingMethod(node)}`);
        }
      }
      if (ts.isIdentifier(node) && node.text === 'progressionDiagnostics') {
        const parent = node.parent;
        if (ts.isVariableDeclaration(parent) && parent.name === node) {
          references.push('declaration');
        } else if (ts.isPropertyAccessExpression(parent) && parent.expression === node) {
          references.push(`.${parent.name.text}`);
        } else if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name) && parent.name.text === 'progression') {
          references.push('progression:');
        } else {
          references.push(`other:${parent.getText(sourceFile).slice(0, 40)}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    expect(sinks.sort()).toEqual([
      'progression@publishRuntimeDiagnostics',
      'var:progressionDiagnostics@publishVisualDiagnostics'
    ].sort());
    expect(references.sort()).toEqual(['.palette', 'declaration', 'progression:'].sort());
    expect(text(MENU)).toContain("MENU_SCENE_VISUAL_DIAGNOSTICS_ATTRIBUTE = 'data-mazer-visual-diagnostics'");
  });

  test('the retired progression badge text objects are never written', () => {
    const menu = text(MENU);
    expect(
      menu.match(/\b(?:menuAi)?[pP]rogressionBadge(?:Label)?Text\.(?:setText|text\s*=)/g) ?? [],
      'A progression badge text object is being written. The badge is retired; if it returns, it must show Rank wording.'
    ).toEqual([]);
    const sourceFile = parse(MENU);
    let body: string | null = null;
    const visit = (node: ts.Node): void => {
      if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'drawLegacyProgressionBadge') {
        body = node.body?.statements.map((statement) => statement.getText(sourceFile)).join('\n') ?? null;
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    expect(body).not.toBeNull();
    expect(body).toContain('return null;');
    expect(body).not.toMatch(/label|palette|add\.text|setText/i);
  });
});
