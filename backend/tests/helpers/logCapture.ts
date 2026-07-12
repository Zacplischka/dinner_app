import { vi } from 'vitest';

// The test-env logger writes NDJSON to process.stdout, so log lines can be
// captured and parsed from a stdout spy. Call inside a test; pair with
// vi.restoreAllMocks() in afterEach.
export function captureLogs() {
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

  return {
    lines,
    /** Log lines with the given msg, projected to their context fields. */
    withMsg(msg: string) {
      return lines.filter((line) => line.msg === msg);
    },
  };
}
