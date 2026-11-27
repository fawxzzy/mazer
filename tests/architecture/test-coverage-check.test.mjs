import assert from 'node:assert/strict';
import { test } from 'vitest';

import { conditionalRequiredSteps, parseWorkflow, unlistedFolderOperands } from '../../scripts/verify/check-test-coverage.mjs';

const workflow = (jobHeader, steps) => `name: x
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

test('the job id follows the step that ends a job, also for bare steps', () => {
  const commands = parse(workflow('', '      - run: npx vitest run tests/core'));
  assert.deepEqual(commands.map((c) => [c.job, c.operands[0]]), [['verify', 'tests/core'], ['other', 'tests/other-only']]);
});

test('a plain step is not conditional (control for the negative cases below)', () => {
  const commands = parse(workflow('', '      - name: A\n        run: npx vitest run tests/core'));
  assert.deepEqual(conditionalRequiredSteps(commands), []);
});

test('a counted step with continue-on-error: true is reported', () => {
  const commands = parse(workflow('', '      - name: A\n        continue-on-error: true\n        run: npx vitest run tests/core'));
  assert.deepEqual(conditionalRequiredSteps(commands), ['tests/core']);
});

test('continue-on-error: false is not a finding', () => {
  const commands = parse(workflow('', '      - name: A\n        continue-on-error: false\n        run: npx vitest run tests/core'));
  assert.deepEqual(conditionalRequiredSteps(commands), []);
});

test('a counted step with an if: condition is reported, also on a bare run step', () => {
  const named = parse(workflow('', '      - name: A\n        if: github.event_name == \'push\'\n        run: npx vitest run tests/core'));
  assert.deepEqual(conditionalRequiredSteps(named), ['tests/core']);
  const bare = parse(workflow('', '      - if: always()\n        run: npx vitest run tests/core'));
  assert.deepEqual(conditionalRequiredSteps(bare), ['tests/core']);
});

test('a job-level continue-on-error or if: marks every counted step of that job', () => {
  const coe = parse(workflow('    continue-on-error: true\n', '      - name: A\n        run: npx vitest run tests/core'));
  assert.deepEqual(conditionalRequiredSteps(coe), ['tests/core']);
  const cond = parse(workflow("    if: github.ref == 'refs/heads/main'\n", '      - name: A\n        run: npx vitest run tests/core'));
  assert.deepEqual(conditionalRequiredSteps(cond), ['tests/core']);
});

test('a conditional step in another job is not a finding for the required job', () => {
  const text = `name: x
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

test('a folder under a listed folder is listed; an unrelated folder is not', () => {
  const commands = inVerify(
    parse(workflow('', '      - name: A\n        run: npx vitest run tests/core tests/reset/sub tests/brand/a/b tests/not-listed tests/reset/x.test.ts'))
  );
  assert.deepEqual(unlistedFolderOperands(commands), ['tests/not-listed']);
});
