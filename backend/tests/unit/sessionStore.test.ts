// SessionStore unit tests - exercised through the store's interface against an
// injected in-memory Redis (ioredis-mock). No real Redis required; each test
// gets a fresh client, so no cross-test cleanup is needed.

import { describe, it, expect, beforeEach } from 'vitest';
import RedisMock from 'ioredis-mock';
import type { Redis } from 'ioredis';
import {
  createSessionStore,
  sessionCodeFromExpiredKey,
  SESSION_TTL_SECONDS,
  type Participant,
  type Session,
} from '../../src/store/sessionStore.js';
import { DomainError } from '../../src/services/DomainError.js';
import type { Restaurant } from '@dinder/shared/types';

const sessionCode = 'TEST1';

const restaurants: Restaurant[] = [
  { placeId: 'place1', name: 'Restaurant 1', rating: 4.5, priceLevel: 2 } as Restaurant,
  { placeId: 'place2', name: 'Restaurant 2', rating: 4.2, priceLevel: 3 } as Restaurant,
  { placeId: 'place3', name: 'Restaurant 3', rating: 3.9, priceLevel: 1 } as Restaurant,
];

let redis: Redis;
let store: ReturnType<typeof createSessionStore>;

beforeEach(async () => {
  // ioredis-mock instances share one in-process data store; flush per test.
  redis = new RedisMock();
  store = createSessionStore(redis);
  await redis.flushall();
});

async function createTestSession(withRestaurants = true) {
  return await store.createSession(sessionCode, {
    hostId: 'host-1',
    hostName: 'Alice',
    restaurants: withRestaurants ? restaurants : undefined,
  });
}

describe('SessionStore', () => {
  describe('createSession / readSession', () => {
    it('round-trips session metadata', async () => {
      const location = { latitude: 37.7749, longitude: -122.4194, address: 'San Francisco, CA' };
      await store.createSession(sessionCode, {
        hostId: 'host-1',
        hostName: 'Alice',
        location,
        searchRadiusMiles: 5,
      });

      const session = await store.readSession(sessionCode);
      expect(session?.sessionCode).toBe(sessionCode);
      expect(session?.hostId).toBe('host-1');
      expect(session?.hostName).toBe('Alice');
      expect(session?.state).toBe('waiting');
      expect(session?.participantCount).toBe(1);
      expect(session?.location).toEqual(location);
      expect(session?.searchRadiusMiles).toBe(5);
    });

    it('omits location when not provided', async () => {
      await createTestSession(false);
      const session = await store.readSession(sessionCode);
      expect(session?.location).toBeUndefined();
      expect(session?.searchRadiusMiles).toBeUndefined();
    });

    it('returns null for a non-existent session', async () => {
      expect(await store.readSession('NONEXIST')).toBeNull();
    });

    it('sets a TTL on every session key, restaurants included', async () => {
      await createTestSession();
      for (const key of [
        `session:${sessionCode}`,
        `session:${sessionCode}:restaurant_ids`,
        `session:${sessionCode}:restaurants`,
      ]) {
        const ttl = await redis.ttl(key);
        expect(ttl).toBeGreaterThan(0);
        expect(ttl).toBeLessThanOrEqual(SESSION_TTL_SECONDS);
      }
    });
  });

  describe('participants', () => {
    it('atomically transfers and releases display-name claims', async () => {
      await createTestSession();
      const token = 'rejoin-token';

      await expect(store.claimDisplayName(sessionCode, 'Alice', 'p1', token)).resolves.toBe(true);
      await store.addParticipant(sessionCode, {
        participantId: 'p1',
        displayName: 'Alice',
        rejoinToken: token,
      });
      await expect(
        store.claimDisplayName(sessionCode, 'Alice', 'impostor', 'other-token')
      ).resolves.toBe(false);

      await expect(store.claimDisplayName(sessionCode, 'Alice', 'p2', token, 'p1')).resolves.toBe(
        true
      );
      await store.removeParticipant(sessionCode, 'p1');
      await expect(
        store.claimDisplayName(sessionCode, 'Alice', 'impostor', 'other-token')
      ).resolves.toBe(false);

      await store.addParticipant(sessionCode, {
        participantId: 'p2',
        displayName: 'Alice',
        rejoinToken: token,
      });
      await store.removeParticipant(sessionCode, 'p2');
      await expect(store.claimDisplayName(sessionCode, 'Alice', 'p3', 'new-token')).resolves.toBe(
        true
      );
    });

    it('adds, lists, and counts participants', async () => {
      await createTestSession();
      const count1 = await store.addParticipant(sessionCode, {
        participantId: 'p1',
        displayName: 'Alice',
        isHost: true,
      });
      const count2 = await store.addParticipant(sessionCode, {
        participantId: 'p2',
        displayName: 'Bob',
      });

      expect(count1).toBe(1);
      expect(count2).toBe(2);
      expect(await store.countParticipants(sessionCode)).toBe(2);
      expect(await store.isParticipant(sessionCode, 'p1')).toBe(true);
      expect(await store.isParticipant(sessionCode, 'nope')).toBe(false);

      const participants = await store.listParticipants(sessionCode);
      expect(participants).toHaveLength(2);
      expect(participants.find((p) => p.participantId === 'p1')?.isHost).toBe(true);
      expect(participants.find((p) => p.participantId === 'p2')?.hasSubmitted).toBe(false);
    });

    it('removes a participant along with their selections', async () => {
      await createTestSession();
      await store.addParticipant(sessionCode, { participantId: 'p1', displayName: 'Alice' });
      await store.recordSubmission(sessionCode, 'p1', ['place1']);

      const remaining = await store.removeParticipant(sessionCode, 'p1');

      expect(remaining).toBe(0);
      expect(await store.getParticipant('p1')).toBeNull();
      expect(await redis.exists(`session:${sessionCode}:p1:selections`)).toBe(0);
    });
  });

  describe('recordSubmission', () => {
    it('stores selections and marks the participant submitted', async () => {
      await createTestSession();
      await store.addParticipant(sessionCode, { participantId: 'p1', displayName: 'Alice' });
      await store.addParticipant(sessionCode, { participantId: 'p2', displayName: 'Bob' });

      const result = await store.recordSubmission(sessionCode, 'p1', ['place1', 'place2']);

      expect(result).toEqual({ submittedCount: 1, participantCount: 2 });
      expect((await store.getParticipant('p1'))?.hasSubmitted).toBe(true);
    });

    it('allows an empty Submission - submitted is a fact about the participant', async () => {
      await createTestSession();
      await store.addParticipant(sessionCode, { participantId: 'p1', displayName: 'Alice' });

      const result = await store.recordSubmission(sessionCode, 'p1', []);

      expect(result).toEqual({ submittedCount: 1, participantCount: 1 });
      expect((await store.getParticipant('p1'))?.hasSubmitted).toBe(true);
    });

    it('rejects a second Submission', async () => {
      await createTestSession();
      await store.addParticipant(sessionCode, { participantId: 'p1', displayName: 'Alice' });
      await store.recordSubmission(sessionCode, 'p1', []);

      const error = await store.recordSubmission(sessionCode, 'p1', ['place1']).then(
        () => null,
        (e) => e
      );

      expect(error).toBeInstanceOf(DomainError);
      expect(error.code).toBe('ALREADY_SUBMITTED');
    });

    it('rejects selections outside the session restaurant list', async () => {
      await createTestSession();
      await store.addParticipant(sessionCode, { participantId: 'p1', displayName: 'Alice' });

      const error = await store.recordSubmission(sessionCode, 'p1', ['place1', 'bogus']).then(
        () => null,
        (e) => e
      );

      expect(error).toBeInstanceOf(DomainError);
      expect(error.code).toBe('INVALID_RESTAURANTS');
    });
  });

  describe('computeAndStoreResults', () => {
    it('returns empty results for a session with no participants', async () => {
      await createTestSession();
      const result = await store.computeAndStoreResults(sessionCode);
      expect(result).toEqual({
        overlappingOptions: [],
        allSelections: {},
        restaurantNames: {},
        hasOverlap: false,
      });
    });

    it('computes the Match as the intersection of all Submissions', async () => {
      await createTestSession();
      await store.addParticipant(sessionCode, { participantId: 'p1', displayName: 'Alice' });
      await store.addParticipant(sessionCode, { participantId: 'p2', displayName: 'Bob' });
      await store.recordSubmission(sessionCode, 'p1', ['place1', 'place2']);
      await store.recordSubmission(sessionCode, 'p2', ['place2', 'place3']);

      const result = await store.computeAndStoreResults(sessionCode);

      expect(result.hasOverlap).toBe(true);
      expect(result.overlappingOptions).toHaveLength(1);
      expect(result.overlappingOptions[0].placeId).toBe('place2');
      expect(result.allSelections['Alice']).toEqual(expect.arrayContaining(['place1', 'place2']));
      expect(result.restaurantNames['place3']).toBe('Restaurant 3');
    });

    it("uses a single participant's selections as the Match (FR-021)", async () => {
      await createTestSession();
      await store.addParticipant(sessionCode, { participantId: 'p1', displayName: 'Alice' });
      await store.recordSubmission(sessionCode, 'p1', ['place1']);

      const result = await store.computeAndStoreResults(sessionCode);

      expect(result.hasOverlap).toBe(true);
      expect(result.overlappingOptions.map((r) => r.placeId)).toEqual(['place1']);
    });

    it('reports no overlap when Submissions are disjoint', async () => {
      await createTestSession();
      await store.addParticipant(sessionCode, { participantId: 'p1', displayName: 'Alice' });
      await store.addParticipant(sessionCode, { participantId: 'p2', displayName: 'Bob' });
      await store.recordSubmission(sessionCode, 'p1', ['place1']);
      await store.recordSubmission(sessionCode, 'p2', ['place3']);

      const result = await store.computeAndStoreResults(sessionCode);

      expect(result.hasOverlap).toBe(false);
      expect(result.overlappingOptions).toEqual([]);
    });
  });

  describe('resetForRestart', () => {
    it('wipes Selections, Submissions, and the Match; back to selecting', async () => {
      await createTestSession();
      await store.addParticipant(sessionCode, { participantId: 'p1', displayName: 'Alice' });
      await store.recordSubmission(sessionCode, 'p1', ['place1']);
      await store.computeAndStoreResults(sessionCode);
      await store.updateState(sessionCode, 'complete');

      await store.resetForRestart(sessionCode);

      expect((await store.readSession(sessionCode))?.state).toBe('selecting');
      expect((await store.getParticipant('p1'))?.hasSubmitted).toBe(false);
      expect(await redis.exists(`session:${sessionCode}:p1:selections`)).toBe(0);
      expect(await redis.exists(`session:${sessionCode}:results`)).toBe(0);

      // A fresh Submission is accepted after Restart
      const result = await store.recordSubmission(sessionCode, 'p1', ['place2']);
      expect(result.submittedCount).toBe(1);
    });
  });

  describe('restaurants', () => {
    it('round-trips the session restaurant list', async () => {
      await createTestSession();
      const { restaurants: list, missingCount } = await store.getRestaurants(sessionCode);
      expect(list.map((r) => r.placeId).sort()).toEqual(['place1', 'place2', 'place3']);
      expect(missingCount).toBe(0);
    });
  });

  describe('deleteSession', () => {
    it('removes every key belonging to the session', async () => {
      await createTestSession();
      await store.addParticipant(sessionCode, { participantId: 'p1', displayName: 'Alice' });
      await store.recordSubmission(sessionCode, 'p1', ['place1']);
      await store.computeAndStoreResults(sessionCode);

      await store.deleteSession(sessionCode);

      const leftovers = await redis.keys(`session:${sessionCode}*`);
      expect(leftovers).toEqual([]);
      expect(await store.getParticipant('p1')).toBeNull();
    });
  });

  // Guards issue #113: the persistence shapes are backend-owned and must survive
  // the full write->Redis->read round-trip with their declared types intact.
  describe('typed round-trip', () => {
    it('round-trips a fully-typed Session, Participants, Selections, Submissions, Restaurants, and the Match', async () => {
      const { session } = await store.createSession(sessionCode, {
        hostId: 'host-1',
        hostName: 'Alice',
        location: { latitude: 1, longitude: 2, address: 'Somewhere' },
        searchRadiusMiles: 3,
        restaurants,
      });
      expect(session.state).toBe('waiting');

      await store.addParticipant(sessionCode, {
        participantId: 'p1',
        displayName: 'Alice',
        isHost: true,
      });
      await store.addParticipant(sessionCode, { participantId: 'p2', displayName: 'Bob' });
      await store.recordSubmission(sessionCode, 'p1', ['place1', 'place2']);
      await store.recordSubmission(sessionCode, 'p2', ['place2', 'place3']);

      const readSession: Session | null = await store.readSession(sessionCode);
      expect(readSession?.location).toEqual({ latitude: 1, longitude: 2, address: 'Somewhere' });
      expect(readSession?.searchRadiusMiles).toBe(3);

      const participant: Participant | null = await store.getParticipant('p1');
      expect(participant).toMatchObject({
        participantId: 'p1',
        displayName: 'Alice',
        sessionCode,
        isHost: true,
        hasSubmitted: true,
      });
      expect(typeof participant?.joinedAt).toBe('number');

      const { restaurants: storedRestaurants } = await store.getRestaurants(sessionCode);
      expect(storedRestaurants.map((r) => r.placeId).sort()).toEqual([
        'place1',
        'place2',
        'place3',
      ]);

      const match = await store.computeAndStoreResults(sessionCode);
      expect(match.overlappingOptions.map((r) => r.placeId)).toEqual(['place2']);
      expect(match.allSelections['Alice']).toEqual(expect.arrayContaining(['place1', 'place2']));
      expect(match.hasOverlap).toBe(true);
    });
  });

  describe('sessionCodeFromExpiredKey', () => {
    it('extracts the code from a root session key', () => {
      expect(sessionCodeFromExpiredKey('session:AB123')).toBe('AB123');
    });

    it('ignores sub-keys and unrelated keys', () => {
      expect(sessionCodeFromExpiredKey('session:AB123:results')).toBeNull();
      expect(sessionCodeFromExpiredKey('participant:xyz')).toBeNull();
    });
  });
});
