import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addDemoFriends,
  computeDemoResults,
  createDemoSession,
  getDemoRestaurants,
  getDemoSession,
  isDemoSessionComplete,
  joinDemoSession,
  leaveDemoSession,
  restartDemoSession,
  simulateRemainingSubmissions,
  submitDemoSelection,
} from '../../src/services/demoSessionService';
import {
  GUIDE_LISTS,
  GUIDE_RESTAURANTS,
  getGuideList,
  getGuideRestaurant,
  getRestaurantsForList,
} from '../../src/demo/guideData';

describe('demo session service', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('should create, read, join, leave, and restart demo sessions', () => {
    const created = createDemoSession({
      hostName: 'Alice',
      location: { latitude: 1, longitude: 2, address: 'Here' },
      searchRadiusMiles: 5,
    });

    expect(created.sessionCode).toHaveLength(6);
    expect(created.shareableLink).toContain(created.sessionCode);

    const bob = joinDemoSession(created.sessionCode, 'Bob');
    expect(getDemoSession(created.sessionCode).participants).toHaveLength(2);

    submitDemoSelection(created.sessionCode, created.host.participantId, [
      GUIDE_RESTAURANTS[0].placeId,
    ]);
    expect(isDemoSessionComplete(created.sessionCode)).toBe(false);

    leaveDemoSession(created.sessionCode, bob.participantId);
    expect(getDemoSession(created.sessionCode).participants).toHaveLength(1);

    restartDemoSession(created.sessionCode);
    expect(getDemoSession(created.sessionCode).participants[0].hasSubmitted).toBe(false);
  });

  it('should regenerate duplicate session codes', () => {
    const randomValues = [
      ...Array(7).fill(0),
      ...Array(6).fill(0),
      ...Array(6).fill(0.1),
      0.2,
    ];
    vi.spyOn(Math, 'random').mockImplementation(() => randomValues.shift() ?? 0.3);

    const first = createDemoSession({ hostName: 'Alice' });
    const second = createDemoSession({ hostName: 'Bob' });

    expect(first.sessionCode).toBe('AAAAAA');
    expect(second.sessionCode).not.toBe(first.sessionCode);
  });

  it('should handle missing and full sessions', () => {
    expect(() => getDemoSession('MISSING')).toThrow('Session not found');
    expect(() => joinDemoSession('MISSING', 'Bob')).toThrow('Session not found');
    expect(() => addDemoFriends('MISSING', 1)).toThrow('Session not found');
    expect(() => submitDemoSelection('MISSING', 'p', [])).toThrow('Session not found');
    expect(() => simulateRemainingSubmissions('MISSING')).toThrow('Session not found');

    const created = createDemoSession({ hostName: 'Alice' });
    addDemoFriends(created.sessionCode, 3);

    expect(() => joinDemoSession(created.sessionCode, 'Eve')).toThrow('Session is full');
    expect(addDemoFriends(created.sessionCode, 2)).toEqual([]);

    leaveDemoSession('MISSING', 'no-op');
    restartDemoSession('MISSING');
  });

  it('should compute overlapping and ranked fallback results', () => {
    const created = createDemoSession({ hostName: 'Alice' });
    const [bob, cara] = addDemoFriends(created.sessionCode, 2);
    const first = GUIDE_RESTAURANTS[0].placeId;
    const second = GUIDE_RESTAURANTS[1].placeId;
    const third = GUIDE_RESTAURANTS[2].placeId;

    submitDemoSelection(created.sessionCode, created.host.participantId, [first, second]);
    submitDemoSelection(created.sessionCode, bob.participantId, [first, third]);
    submitDemoSelection(created.sessionCode, cara.participantId, [first]);

    expect(isDemoSessionComplete(created.sessionCode)).toBe(true);
    expect(computeDemoResults(created.sessionCode)).toMatchObject({
      hasOverlap: true,
      overlappingOptions: [expect.objectContaining({ placeId: first })],
    });

    restartDemoSession(created.sessionCode);
    submitDemoSelection(created.sessionCode, created.host.participantId, [first]);
    submitDemoSelection(created.sessionCode, bob.participantId, [second]);
    submitDemoSelection(created.sessionCode, cara.participantId, [second, third]);

    expect(computeDemoResults(created.sessionCode)).toMatchObject({
      hasOverlap: true,
      overlappingOptions: [expect.objectContaining({ placeId: second })],
    });

    const missingSelection = createDemoSession({ hostName: 'Dina' });
    const [eli] = addDemoFriends(missingSelection.sessionCode, 1);
    submitDemoSelection(missingSelection.sessionCode, missingSelection.host.participantId, [first]);
    const partialResults = computeDemoResults(missingSelection.sessionCode);
    expect(partialResults.allSelections[eli.displayName]).toEqual([]);

    const emptySession = createDemoSession({ hostName: 'Fran' });
    leaveDemoSession(emptySession.sessionCode, emptySession.host.participantId);
    expect(computeDemoResults(emptySession.sessionCode)).toMatchObject({
      hasOverlap: false,
      overlappingOptions: [],
      allSelections: {},
    });
  });

  it('should simulate remaining submissions and recover from invalid storage', () => {
    localStorage.setItem('dinder_demo_sessions_v1', '{bad json');
    expect(() => getDemoSession('BAD')).toThrow('Session not found');

    const created = createDemoSession({ hostName: 'Alice' });
    addDemoFriends(created.sessionCode, 2);
    submitDemoSelection(created.sessionCode, created.host.participantId, [
      GUIDE_RESTAURANTS[0].placeId,
    ]);

    simulateRemainingSubmissions(created.sessionCode);

    expect(isDemoSessionComplete(created.sessionCode)).toBe(true);
    expect(getDemoRestaurants(created.sessionCode)).toBe(GUIDE_RESTAURANTS);
  });
});

describe('guide data helpers', () => {
  it('should find restaurants and lists', () => {
    expect(getGuideRestaurant(GUIDE_RESTAURANTS[0].placeId)).toBe(GUIDE_RESTAURANTS[0]);
    expect(getGuideRestaurant('missing')).toBeUndefined();
    expect(getGuideList(GUIDE_LISTS[0].id)).toBe(GUIDE_LISTS[0]);
    expect(getGuideList('missing')).toBeUndefined();
    expect(getRestaurantsForList(GUIDE_LISTS[0].id).length).toBeGreaterThan(0);
    expect(getRestaurantsForList('missing')).toEqual([]);
  });
});
