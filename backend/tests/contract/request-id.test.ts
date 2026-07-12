import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/server.js';

// The test-env logger writes NDJSON to process.stdout, so log lines can be
// captured and parsed from a stdout spy.
function captureStdout() {
  const lines: Record<string, unknown>[] = [];
  vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
    for (const line of String(chunk).split('\n')) {
      if (!line.trim()) continue;
      try {
        lines.push(JSON.parse(line));
      } catch {
        // non-JSON output (test runner noise) — ignore
      }
    }
    return true;
  }) as typeof process.stdout.write);
  return lines;
}

describe('Contract Test: request IDs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sets an X-Request-Id header on every response', async () => {
    const response = await request(app).get('/api/sessions/ZZZ999').expect(404);

    expect(response.headers['x-request-id']).toMatch(/\S+/);
  });

  it('honors an incoming X-Request-Id header', async () => {
    const response = await request(app)
      .get('/api/sessions/ZZZ999')
      .set('X-Request-Id', 'my-trace-id')
      .expect(404);

    expect(response.headers['x-request-id']).toBe('my-trace-id');
  });

  it('stamps every log line emitted during a request with the request id', async () => {
    const lines = captureStdout();

    await request(app)
      .get('/api/sessions/ZZZ999')
      .set('X-Request-Id', 'trace-abc')
      .expect(404);

    const requestLines = lines.filter(
      (line) => (line.req as { id?: string } | undefined)?.id === 'trace-abc'
    );
    // at least the route's rejection warn + pino-http's completion line
    expect(requestLines.length).toBeGreaterThanOrEqual(2);
    expect(
      requestLines.some((line) => line.msg === 'Rejected REST session get')
    ).toBe(true);
  });
});
