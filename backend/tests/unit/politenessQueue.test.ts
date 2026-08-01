import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPolitenessQueue } from '../../src/services/politenessQueue.js';

describe('createPolitenessQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs tasks one at a time with the floor between request starts', async () => {
    const enqueue = createPolitenessQueue(500);
    const starts: number[] = [];
    let running = 0;
    const task = () => {
      expect(running).toBe(0);
      running += 1;
      starts.push(Date.now());
      return new Promise<void>((resolve) =>
        setTimeout(() => {
          running -= 1;
          resolve();
        }, 50)
      );
    };

    const all = Promise.all([enqueue(task), enqueue(task), enqueue(task)]);
    await vi.runAllTimersAsync();
    await all;

    expect(starts).toHaveLength(3);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(500);
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(500);
  });

  it('returns each task result and keeps serving after a task fails', async () => {
    const enqueue = createPolitenessQueue(500);
    const failing = enqueue(() => Promise.reject(new Error('boom')));
    const surviving = enqueue(() => Promise.resolve('ok'));
    // Attach the rejection handler before advancing timers.
    const failure = failing.catch((error: Error) => error.message);
    await vi.runAllTimersAsync();

    expect(await failure).toBe('boom');
    expect(await surviving).toBe('ok');
  });
});
