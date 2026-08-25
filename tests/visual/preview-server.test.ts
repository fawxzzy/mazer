import { createServer } from 'node:net';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

interface PreviewReservation {
  preferredPort: number;
  port: number;
  baseUrl: string;
  usedFallbackPort: boolean;
  release: () => Promise<void>;
}

const listen = (port: number, host = '127.0.0.1') => new Promise<import('node:net').Server>((resolvePromise, rejectPromise) => {
  const server = createServer();
  server.once('error', rejectPromise);
  server.listen(port, host, () => {
    server.removeListener('error', rejectPromise);
    resolvePromise(server);
  });
});

const close = (server: import('node:net').Server) => new Promise<void>((resolvePromise, rejectPromise) => {
  server.close((error) => {
    if (error) {
      rejectPromise(error);
      return;
    }

    resolvePromise();
  });
});

const loadPreviewHelpers = async (): Promise<{
  acquirePreviewPort: (options?: { requestedBaseUrl?: string }) => Promise<PreviewReservation>;
}> => {
  // @ts-expect-error The helper module is plain .mjs without TS declarations.
  const helpers = await import('../../scripts/visual/preview-server.mjs');
  return helpers as {
    acquirePreviewPort: (options?: { requestedBaseUrl?: string }) => Promise<PreviewReservation>;
  };
};

describe('health preview port acquisition', () => {
  test('routes direct browser recovery navigation to the application shell', () => {
    const vercelConfig = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')) as {
      rewrites?: Array<{ destination: string; source: string }>;
    };
    const index = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

    expect(vercelConfig.rewrites).toContainEqual({
      destination: '/index.html',
      source: '/update-password'
    });
    expect(index).toContain('<script type="module" src="/src/boot/main.ts"></script>');
  });

  test('keeps the requested port when it is free', async () => {
    const { acquirePreviewPort } = await loadPreviewHelpers();
    const probe = await listen(0);
    const address = probe.address();
    if (!address || typeof address === 'string') {
      await close(probe);
      throw new Error('Could not resolve probe port.');
    }
    const port = address.port;
    await close(probe);

    const reservation = await acquirePreviewPort({
      requestedBaseUrl: `http://127.0.0.1:${port}`
    });

    try {
      expect(reservation.port).toBe(port);
      expect(reservation.preferredPort).toBe(port);
      expect(reservation.baseUrl).toBe(`http://127.0.0.1:${port}`);
      expect(reservation.usedFallbackPort).toBe(false);
    } finally {
      await reservation.release();
    }
  });

  test('falls back to a different free port when the requested port is busy', async () => {
    const { acquirePreviewPort } = await loadPreviewHelpers();
    const blocker = await listen(0);
    const address = blocker.address();
    if (!address || typeof address === 'string') {
      await close(blocker);
      throw new Error('Could not resolve blocker port.');
    }
    const busyPort = address.port;

    const reservation = await acquirePreviewPort({
      requestedBaseUrl: `http://127.0.0.1:${busyPort}`
    });

    try {
      expect(reservation.preferredPort).toBe(busyPort);
      expect(reservation.port).not.toBe(busyPort);
      expect(reservation.baseUrl).toBe(`http://127.0.0.1:${reservation.port}`);
      expect(reservation.usedFallbackPort).toBe(true);
    } finally {
      await reservation.release();
      await close(blocker);
    }
  });
});
