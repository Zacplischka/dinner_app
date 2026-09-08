import { expect, it, vi } from 'vitest';
import { command } from '../../src/websocket/command.js';

it('acknowledges only once even when a handler acknowledges then rejects', async () => {
  const callback = vi.fn();
  command(async (_payload, ack) => {
    ack({ success: true, data: null });
    ack({ success: false, error: { code: 'INTERNAL_ERROR', message: 'duplicate' } });
    throw new Error('after acknowledgement');
  })({}, callback);
  await new Promise(setImmediate);
  expect(callback.mock.calls).toEqual([[{ success: true, data: null }]]);
});

it('maps sync throws and async rejections and contains a throwing acknowledgement', async () => {
  for (const handler of [
    () => {
      throw new Error('sync');
    },
    async () => {
      throw new Error('async');
    },
  ]) {
    const callback = vi.fn(() => {
      throw new Error('ack failed');
    });
    command(handler)({}, callback);
    await new Promise(setImmediate);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred. Please try again later.',
      },
    });
  }
});
