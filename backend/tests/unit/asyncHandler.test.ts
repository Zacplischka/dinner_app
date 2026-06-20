import { describe, expect, it, vi } from 'vitest';
import { asyncHandler } from '../../src/api/asyncHandler.js';

describe('asyncHandler', () => {
  it('should run successful async route handlers', async () => {
    const req = {};
    const res = {};
    const next = vi.fn();
    const handler = vi.fn(async () => undefined);

    await asyncHandler(handler)(req as never, res as never, next);

    expect(handler).toHaveBeenCalledWith(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });

  it('should forward rejected route handlers to next', async () => {
    const req = {};
    const res = {};
    const next = vi.fn();
    const error = new Error('route failed');

    await asyncHandler(async () => {
      throw error;
    })(req as never, res as never, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
