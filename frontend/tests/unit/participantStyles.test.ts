// Every Participant avatar — lobby, deck, results, Group Order — wears the ring
// for its position, so one person keeps one colour across the whole Session.
import { describe, expect, it } from 'vitest';
import { participantRingClass } from '../../src/utils/participantStyles';

describe('participantRingClass', () => {
  it('gives the same position the same ring every time', () => {
    expect(participantRingClass(2)).toBe(participantRingClass(2));
    expect(participantRingClass(2)).not.toBe('');
  });

  it('tells a full Session of four Participants apart', () => {
    const rings = new Set([0, 1, 2, 3].map(participantRingClass));
    expect(rings.size).toBe(4);
  });

  it('wraps around rather than running out past the palette', () => {
    expect(participantRingClass(4)).toBe(participantRingClass(0));
    expect(participantRingClass(9)).toBe(participantRingClass(1));
  });
});
