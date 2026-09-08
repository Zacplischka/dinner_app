import { expect, it, vi } from 'vitest';

const drawing = vi.hoisted(() => ({
  cat: vi.fn(),
  rounded: vi.fn(),
  ellipse: vi.fn(),
  path: vi.fn(),
  line: vi.fn(),
  star: vi.fn(),
}));
vi.mock('../../src/components/mascotDrawing', () => ({ sceneDrawing: () => drawing }));
import { drawSocialMoment } from '../../src/components/socialMomentScene';

it('draws only actual Participants’ chairs and reads Ready and offline from the roster', () => {
  const ctx = {
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  const seats = [{ ready: true }, { ready: false, offline: true }];
  const cushions = () =>
    drawing.rounded.mock.calls.filter((call) => call[2] === 20 && call[3] === 25);
  drawSocialMoment(ctx, 248, 0, { moment: 'gather', seats });
  expect(cushions().map((call) => call[5])).toEqual(['#9df3bd', '#637082']);

  drawing.rounded.mockClear();
  drawSocialMoment(ctx, 248, 12, { moment: 'gather', seats: [seats[0]] });
  expect(cushions()).toHaveLength(1);

  drawing.rounded.mockClear();
  drawSocialMoment(ctx, 248, 15, { moment: 'gather', seats: [...seats, { ready: false }] });
  expect(cushions().map((call) => call[5])).toEqual(['#9df3bd', '#637082', '#EA7058']);
});
