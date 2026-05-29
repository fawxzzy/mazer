import { beforeEach, describe, expect, test, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const writeFileMock = vi.fn();

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');

  return {
    ...actual,
    writeFile: writeFileMock
  };
});

describe('training common helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    writeFileMock.mockReset();
  });

  test('writeJson retries transient Windows file locks before succeeding', async () => {
    writeFileMock
      .mockRejectedValueOnce(Object.assign(new Error('locked once'), { code: 'EPERM' }))
      .mockRejectedValueOnce(Object.assign(new Error('locked twice'), { code: 'EBUSY' }))
      .mockResolvedValue(undefined);

    const { writeJson } = await import('../../../scripts/training/common.mjs');
    const writePromise = writeJson('tmp/training/retry-test.json', { ok: true });

    await vi.runAllTimersAsync();
    await writePromise;

    expect(writeFileMock).toHaveBeenCalledTimes(3);
    expect(writeFileMock).toHaveBeenLastCalledWith(
      'tmp/training/retry-test.json',
      '{\n  "ok": true\n}\n',
      'utf8'
    );
  });

  test('writeJson surfaces non-retryable write failures immediately', async () => {
    const permissionError = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    writeFileMock.mockRejectedValue(permissionError);

    const { writeJson } = await import('../../../scripts/training/common.mjs');
    const writePromise = writeJson('tmp/training/retry-test.json', { ok: false });

    await expect(writePromise).rejects.toBe(permissionError);
    expect(writeFileMock).toHaveBeenCalledTimes(1);
  });

  test('resolveStoredRepoPath rebases stale repo-root absolute paths into the current repo root', async () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
    const liveRelativePath = 'tmp/training/resolve-stored-repo-path/rebased.json';
    const liveAbsolutePath = path.resolve(repoRoot, liveRelativePath);
    const staleAbsolutePath = 'C:/ATLAS/repos/old-mazer/tmp/training/resolve-stored-repo-path/rebased.json';

    rmSync(path.dirname(liveAbsolutePath), { recursive: true, force: true });
    mkdirSync(path.dirname(liveAbsolutePath), { recursive: true });
    writeFileSync(liveAbsolutePath, '{}\n', 'utf8');

    const { resolveStoredRepoPath } = await import('../../../scripts/training/common.mjs');

    expect(existsSync(staleAbsolutePath)).toBe(false);
    expect(resolveStoredRepoPath(repoRoot, staleAbsolutePath)).toBe(liveAbsolutePath);
    expect(resolveStoredRepoPath(repoRoot, liveRelativePath)).toBe(liveAbsolutePath);

    rmSync(path.dirname(liveAbsolutePath), { recursive: true, force: true });
  });
});
