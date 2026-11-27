import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';

import { conditionalRequiredSteps, parseWorkflow, unlistedFolderOperands } from '../../scripts/verify/check-test-coverage.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// The fixture has an `on:` block with two-space keys (pull_request:, push:) on purpose: the real workflow has one, and a header
// reader that does not start at `jobs:` mistakes those keys for jobs.
const workflow = (jobHeader, steps) => `name: x
on:
  pull_request:
    paths-ignore:
      - "docs/**"
  push:
    branches:
      - main
jobs:
  verify:
    runs-on: ubuntu-latest
${jobHeader}    steps:
${steps}
  other:
    runs-on: ubuntu-latest
    steps:
      - name: Not required
        run: npx vitest run tests/other-only
`;

const parse = (text) => parseWorkflow('verify.yml', text);
const inVerify = (commands) => commands.filter((c) => c.job === 'verify');
const flagged = (jobHeader, steps) => conditionalRequiredSteps(parse(workflow(jobHeader, steps)));
const step = (extra) => `      - name: A\n${extra}        run: npx vitest run tests/core`;

test('a bare "- run:" step is its own step, not merged into the previous one', () => {
  const commands = inVerify(
    parse(
      workflow(
        '',
        `      - name: First
        run: npx vitest run tests/core
      - run: npx vitest run tests/render
      - uses: actions/checkout@v4
      - run: npx vitest run tests/reset`
      )
    )
  );
  assert.deepEqual(commands.map((c) => c.operands), [['tests/core'], ['tests/render'], ['tests/reset']]);
});

test('jobs come from under jobs:, never from the on: block keys', () => {
  const commands = parse(workflow('', '      - run: npx vitest run tests/core'));
  assert.deepEqual(commands.map((c) => [c.job, c.operands[0]]), [['verify', 'tests/core'], ['other', 'tests/other-only']]);
});

test('a "- run:" line inside a run: block body is body text, not a step', () => {
  // Step A is conditional through its first key; if the "- run:" body line were split off as its own step, the ghost command
  // would lose that flag.
  const commands = inVerify(
    parse(
      workflow(
        '',
        [
          '      - name: A',
          '        if: always()',
          '        run: |',
          '          echo start',
          '          - run: npx vitest run tests/ghost',
          '      - run: npx vitest run tests/render'
        ].join('\n')
      )
    )
  );
  assert.deepEqual(commands.map((c) => [c.operands[0], c.conditional]), [['tests/ghost', true], ['tests/render', false]]);
});

test('a plain step is not conditional (control for the negative cases below)', () => {
  assert.deepEqual(flagged('', step('')), []);
});

test('a counted step with continue-on-error: true is reported', () => {
  assert.deepEqual(flagged('', step('        continue-on-error: true\n')), ['tests/core']);
});

test('continue-on-error: false is not a finding, also with a trailing comment', () => {
  assert.deepEqual(flagged('', step('        continue-on-error: false\n')), []);
  assert.deepEqual(flagged('', step('        continue-on-error: false # keep the gate\n')), []);
  assert.deepEqual(flagged('', step('        continue-on-error: true # not allowed\n')), ['tests/core']);
});

test('quoted keys are still found', () => {
  assert.deepEqual(flagged('', step('        "continue-on-error": true\n')), ['tests/core']);
  assert.deepEqual(flagged('', step("        'if': false\n")), ['tests/core']);
});

test('a counted step with an if: condition is reported, also on a bare run step', () => {
  assert.deepEqual(flagged('', step("        if: github.event_name == 'push'\n")), ['tests/core']);
  assert.deepEqual(flagged('', '      - if: always()\n        run: npx vitest run tests/core'), ['tests/core']);
});

test('a flow-style step that carries a test command is a failure (unsupported form)', () => {
  const found = flagged('', '      - { if: false, run: npx vitest run tests/core }');
  assert.equal(found.length, 1);
  assert.match(found[0], /tests\/core.*flow-style/);
  assert.deepEqual(flagged('', '      - { name: build, run: npm run build }'), []);
});

test('a job-level continue-on-error or if: marks every counted step of that job', () => {
  assert.deepEqual(flagged('    continue-on-error: true\n', step('')), ['tests/core']);
  assert.deepEqual(flagged("    if: github.ref == 'refs/heads/main'\n", step('')), ['tests/core']);
  assert.deepEqual(flagged('    continue-on-error: false\n', step('')), []);
});

test('a conditional step in another job is not a finding for the required job', () => {
  const text = `name: x
on:
  push:
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - name: A
        run: npx vitest run tests/core
  other:
    runs-on: ubuntu-latest
    continue-on-error: true
    steps:
      - name: B
        run: npx vitest run tests/other-only
`;
  assert.deepEqual(conditionalRequiredSteps(parse(text)), []);
});

test('the Chromium install flag is per job: an install in another job does not satisfy "after the install"', () => {
  const text = `name: x
on:
  push:
jobs:
  other:
    runs-on: ubuntu-latest
    steps:
      - run: npx playwright install chromium
  verify:
    runs-on: ubuntu-latest
    steps:
      - run: npx vitest run tests/ui
      - run: npx playwright install chromium
      - run: npx vitest run tests/analysis
`;
  const commands = inVerify(parse(text));
  assert.deepEqual(commands.map((c) => [c.operands[0], c.afterChromium]), [['tests/ui', false], ['tests/analysis', true]]);
});

test('a folder under a listed folder is listed; an unrelated folder is not', () => {
  const commands = inVerify(
    parse(workflow('', '      - name: A\n        run: npx vitest run tests/core tests/reset/sub tests/brand/a/b tests/not-listed tests/reset/x.test.ts'))
  );
  assert.deepEqual(unlistedFolderOperands(commands), ['tests/not-listed']);
});

// The same checks against the real workflow text, so a header-format change in verify.yml cannot silently disable them.
const realWorkflow = fs.readFileSync(path.join(repoRoot, '.github', 'workflows', 'verify.yml'), 'utf8').replaceAll('\r\n', '\n');

test('real verify.yml: the test steps bind to the job named verify and none is conditional', () => {
  const commands = parse(realWorkflow);
  const verify = inVerify(commands);
  assert.ok(verify.length >= 8, `expected the test steps under job verify, found ${verify.length}`);
  assert.ok(verify.some((c) => c.operands.includes('tests/core')));
  assert.ok(verify.some((c) => c.operands.includes('tests/ui') && !c.afterChromium), 'the folder run is before the Chromium install');
  assert.ok(
    verify.some((c) => c.operands.includes('tests/ui/dom-settings-primitives.test.ts') && c.afterChromium),
    'the browser step is after the Chromium install, inside job verify'
  );
  assert.deepEqual(conditionalRequiredSteps(commands), []);
});

test('real verify.yml: a job-level continue-on-error or if: on verify is a finding', () => {
  const header = /^ {2}verify:\n/m;
  assert.match(realWorkflow, header);
  assert.ok(conditionalRequiredSteps(parse(realWorkflow.replace(header, '  verify:\n    continue-on-error: true\n'))).length > 0);
  assert.ok(conditionalRequiredSteps(parse(realWorkflow.replace(header, "  verify:\n    if: github.ref == 'x'\n"))).length > 0);
});

test('real verify.yml: a step-level continue-on-error on the folder step is a finding', () => {
  const at = '      - name: Verify the remaining tests folders\n';
  assert.ok(realWorkflow.includes(at));
  assert.ok(conditionalRequiredSteps(parse(realWorkflow.replace(at, `${at}        continue-on-error: true\n`))).length > 0);
});
