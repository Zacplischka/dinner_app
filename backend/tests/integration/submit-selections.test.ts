import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import request from 'supertest';
import type { Express } from 'express';
import Redis from 'ioredis';
import { getTestRedis, cleanupTestData } from '../helpers/testSetup.js';
import type { Restaurant } from '@dinner-app/shared/types';

// We'll import the app once it's exposed for testing
// For now, we'll use the running server
const SOCKET_URL = 'http://localhost:3001';

// Mock Place IDs (replacing hardcoded optionIds)
const PLACE_IDS = {
  place1: 'ChIJplace1mockid',
  place2: 'ChIJplace2mockid',
  place3: 'ChIJplace3mockid',
  place4: 'ChIJplace4mockid',
  place5: 'ChIJplace5mockid',
};

// Mock restaurant data
const MOCK_RESTAURANTS: Restaurant[] = [
  {
    placeId: PLACE_IDS.place1,
    name: 'Pizza Palace',
    rating: 4.5,
    priceLevel: 2,
    cuisineType: 'Italian',
    address: '123 Pizza St',
  },
  {
    placeId: PLACE_IDS.place2,
    name: 'Sushi Spot',
    rating: 4.7,
    priceLevel: 3,
    cuisineType: 'Japanese',
    address: '456 Sushi Ave',
  },
  {
    placeId: PLACE_IDS.place3,
    name: 'Thai Kitchen',
    rating: 4.3,
    priceLevel: 2,
    cuisineType: 'Thai',
    address: '789 Thai Blvd',
  },
  {
    placeId: PLACE_IDS.place4,
    name: 'Italian Bistro',
    rating: 4.6,
    priceLevel: 3,
    cuisineType: 'Italian',
    address: '321 Bistro Ln',
  },
  {
    placeId: PLACE_IDS.place5,
    name: 'Mexican Grill',
    rating: 4.4,
    priceLevel: 2,
    cuisineType: 'Mexican',
    address: '654 Taco Way',
  },
];

/**
 * Set up mock restaurant data in Redis for a session
 */
async function setupMockRestaurants(redis: Redis, sessionCode: string): Promise<void> {
  // Store restaurant Place IDs in a Set
  const placeIds = MOCK_RESTAURANTS.map(r => r.placeId);
  await redis.sadd(`session:${sessionCode}:restaurant_ids`, ...placeIds);

  // Store full restaurant data in a Hash
  const restaurantData: Record<string, string> = {};
  MOCK_RESTAURANTS.forEach(restaurant => {
    restaurantData[restaurant.placeId] = JSON.stringify(restaurant);
  });
  await redis.hset(`session:${sessionCode}:restaurants`, restaurantData);

  // Set TTL on restaurant keys (30 minutes)
  const TTL_SECONDS = 1800; // 30 minutes
  await redis.expire(`session:${sessionCode}:restaurant_ids`, TTL_SECONDS);
  await redis.expire(`session:${sessionCode}:restaurants`, TTL_SECONDS);
}

describe('Integration Test: Submit Selections Flow (FR-007, FR-008, FR-023)', () => {
  let redis: Redis;
  let testSessionCode: string;
  let app: Express; // Will use the live server for now

  beforeAll(async () => {
    redis = getTestRedis();
    // Note: Using live server at http://localhost:3001
  });

  beforeEach(async () => {
    // Clean up before each test
    await cleanupTestData(redis);

    // Create fresh session for each test
    const response = await request(SOCKET_URL)
      .post('/api/sessions')
      .send({ hostName: 'Alice' });

    testSessionCode = response.body.sessionCode;

    // Set up mock restaurant data for the session
    await setupMockRestaurants(redis, testSessionCode);
  });

  afterAll(async () => {
    await cleanupTestData(redis);
  });

  it('should store selections in Redis when participant submits', async () => {
    const bob = ioClient(SOCKET_URL, { transports: ['websocket'] });

    await new Promise<void>((resolve, reject) => {
      bob.on('connect', () => {
        // Bob joins the session
        bob.emit(
          'session:join',
          {
            sessionCode: testSessionCode,
            displayName: 'Bob',
          },
          async (response: any) => {
            expect(response.success).toBe(true);

            // Bob submits selections using Place IDs
            bob.emit(
              'selection:submit',
              {
                sessionCode: testSessionCode,
                selections: [PLACE_IDS.place1, PLACE_IDS.place2],
              },
              async (submitResponse: any) => {
                try {
                  expect(submitResponse.success).toBe(true);

                  // Verify selections stored in Redis
                  const storedSelections = await redis.smembers(
                    `session:${testSessionCode}:${bob.id}:selections`
                  );
                  expect(storedSelections).toContain(PLACE_IDS.place1);
                  expect(storedSelections).toContain(PLACE_IDS.place2);
                  expect(storedSelections.length).toBe(2);

                  bob.close();
                  resolve();
                } catch (error) {
                  reject(error);
                }
              }
            );
          }
        );
      });

      bob.on('connect_error', reject);
    });
  });

  it('should broadcast participant:submitted with count only (FR-023 privacy)', async () => {
    const alice = ioClient(SOCKET_URL, { transports: ['websocket'] });
    const bob = ioClient(SOCKET_URL, { transports: ['websocket'] });

    await new Promise<void>((resolve, reject) => {
      let aliceJoined = false;
      let bobJoined = false;

      // Alice joins (she's the host, but needs to join via WebSocket too)
      alice.on('connect', () => {
        alice.emit(
          'session:join',
          {
            sessionCode: testSessionCode,
            displayName: 'Alice',
          },
          (response: any) => {
            expect(response.success).toBe(true);
            aliceJoined = true;
            if (bobJoined) {
              // Both joined, now Bob submits
              submitBobSelections();
            }
          }
        );
      });

      // Bob joins
      bob.on('connect', () => {
        bob.emit(
          'session:join',
          {
            sessionCode: testSessionCode,
            displayName: 'Bob',
          },
          (response: any) => {
            expect(response.success).toBe(true);
            bobJoined = true;
            if (aliceJoined) {
              // Both joined, now Bob submits
              submitBobSelections();
            }
          }
        );
      });

      const submitBobSelections = () => {
        // Alice should receive participant:submitted event when Bob submits
        alice.on('participant:submitted', (data: any) => {
          try {
            expect(data.participantId).toBe(bob.id);
            expect(data.submittedCount).toBe(1); // Only Bob submitted
            expect(data.participantCount).toBe(2); // Alice + Bob

            // FR-023: Event should NOT contain selections
            expect(data).not.toHaveProperty('selections');
            expect(data).not.toHaveProperty('optionIds');

            alice.close();
            bob.close();
            resolve();
          } catch (error) {
            reject(error);
          }
        });

        // Bob submits selections using Place IDs
        bob.emit(
          'selection:submit',
          {
            sessionCode: testSessionCode,
            selections: [PLACE_IDS.place1, PLACE_IDS.place2, PLACE_IDS.place3],
          },
          (response: any) => {
            expect(response.success).toBe(true);
          }
        );
      };

      alice.on('connect_error', reject);
      bob.on('connect_error', reject);
    });
  }, 10000); // Increase timeout for this test

  it('should keep selections private until all submit (FR-008)', async () => {
    const alice = ioClient(SOCKET_URL, { transports: ['websocket'] });
    const bob = ioClient(SOCKET_URL, { transports: ['websocket'] });

    await new Promise<void>((resolve, reject) => {
      let aliceJoined = false;
      let bobJoined = false;
      let bobSubmitted = false;

      alice.on('connect', () => {
        alice.emit(
          'session:join',
          {
            sessionCode: testSessionCode,
            displayName: 'Alice',
          },
          (response: any) => {
            expect(response.success).toBe(true);
            aliceJoined = true;
            if (bobJoined) {
              proceedToSubmissions();
            }
          }
        );
      });

      bob.on('connect', () => {
        bob.emit(
          'session:join',
          {
            sessionCode: testSessionCode,
            displayName: 'Bob',
          },
          (response: any) => {
            expect(response.success).toBe(true);
            bobJoined = true;
            if (aliceJoined) {
              proceedToSubmissions();
            }
          }
        );
      });

      const proceedToSubmissions = () => {
        // Track events received
        let receivedResults = false;

        // Alice should receive participant:submitted but NOT session:results yet
        alice.on('participant:submitted', (data: any) => {
          expect(data.submittedCount).toBe(1);
          expect(data.participantCount).toBe(2);

          // Verify Alice CANNOT see Bob's selections yet
          expect(data).not.toHaveProperty('selections');

          bobSubmitted = true;

          // Now Alice submits too using Place IDs
          alice.emit(
            'selection:submit',
            {
              sessionCode: testSessionCode,
              selections: [PLACE_IDS.place2, PLACE_IDS.place4],
            },
            (response: any) => {
              expect(response.success).toBe(true);
            }
          );
        });

        // Alice should receive session:results ONLY after both submit
        alice.on('session:results', (data: any) => {
          try {
            expect(bobSubmitted).toBe(true); // Bob submitted first
            expect(data.sessionCode).toBe(testSessionCode);

            // Now Alice can see all selections (FR-011 transparency)
            expect(data.allSelections).toHaveProperty('Alice');
            expect(data.allSelections).toHaveProperty('Bob');
            expect(data.allSelections.Bob).toContain(PLACE_IDS.place1);
            expect(data.allSelections.Alice).toContain(PLACE_IDS.place2);

            // Verify overlap calculation
            expect(data.overlappingOptions).toBeDefined();
            expect(data.hasOverlap).toBe(true);

            receivedResults = true;
            alice.close();
            bob.close();
            resolve();
          } catch (error) {
            reject(error);
          }
        });

        // Bob submits first using Place IDs
        bob.emit(
          'selection:submit',
          {
            sessionCode: testSessionCode,
            selections: [PLACE_IDS.place1, PLACE_IDS.place2],
          },
          (response: any) => {
            expect(response.success).toBe(true);
          }
        );
      };

      alice.on('connect_error', reject);
      bob.on('connect_error', reject);
    });
  }, 15000);

  it('should track submitted count accurately (FR-009)', async () => {
    const alice = ioClient(SOCKET_URL, { transports: ['websocket'] });
    const bob = ioClient(SOCKET_URL, { transports: ['websocket'] });
    const charlie = ioClient(SOCKET_URL, { transports: ['websocket'] });

    await new Promise<void>((resolve, reject) => {
      let joinedCount = 0;
      const targetCount = 3;

      const handleJoin = () => {
        joinedCount++;
        if (joinedCount === targetCount) {
          proceedToSubmissions();
        }
      };

      alice.on('connect', () => {
        alice.emit(
          'session:join',
          { sessionCode: testSessionCode, displayName: 'Alice' },
          handleJoin
        );
      });

      bob.on('connect', () => {
        bob.emit(
          'session:join',
          { sessionCode: testSessionCode, displayName: 'Bob' },
          handleJoin
        );
      });

      charlie.on('connect', () => {
        charlie.emit(
          'session:join',
          { sessionCode: testSessionCode, displayName: 'Charlie' },
          handleJoin
        );
      });

      const proceedToSubmissions = () => {
        let submittedCount = 0;

        // Alice tracks submissions
        alice.on('participant:submitted', (data: any) => {
          submittedCount++;
          expect(data.submittedCount).toBe(submittedCount);
          expect(data.participantCount).toBe(3);

          if (submittedCount === 2) {
            // Bob and Charlie submitted, Alice submits last using Place ID
            alice.emit(
              'selection:submit',
              {
                sessionCode: testSessionCode,
                selections: [PLACE_IDS.place3],
              },
              (response: any) => {
                expect(response.success).toBe(true);
              }
            );
          }
        });

        // Wait for results after all 3 submit
        alice.on('session:results', (data: any) => {
          try {
            expect(submittedCount).toBe(2); // Received 2 notifications before submitting
            alice.close();
            bob.close();
            charlie.close();
            resolve();
          } catch (error) {
            reject(error);
          }
        });

        // Bob submits first using Place ID
        bob.emit(
          'selection:submit',
          {
            sessionCode: testSessionCode,
            selections: [PLACE_IDS.place1],
          },
          (response: any) => {
            expect(response.success).toBe(true);
          }
        );

        // Charlie submits second (after small delay) using Place ID
        setTimeout(() => {
          charlie.emit(
            'selection:submit',
            {
              sessionCode: testSessionCode,
              selections: [PLACE_IDS.place2],
            },
            (response: any) => {
              expect(response.success).toBe(true);
            }
          );
        }, 200);
      };
    });
  }, 20000);

  it('should allow multiple selections per participant (FR-007)', async () => {
    const bob = ioClient(SOCKET_URL, { transports: ['websocket'] });

    await new Promise<void>((resolve, reject) => {
      bob.on('connect', () => {
        bob.emit(
          'session:join',
          { sessionCode: testSessionCode, displayName: 'Bob' },
          () => {
            // Submit 5 selections using Place IDs
            bob.emit(
              'selection:submit',
              {
                sessionCode: testSessionCode,
                selections: [
                  PLACE_IDS.place1,
                  PLACE_IDS.place2,
                  PLACE_IDS.place3,
                  PLACE_IDS.place4,
                  PLACE_IDS.place5,
                ],
              },
              async (response: any) => {
                try {
                  if (!response.success) {
                    console.error('Selection submission failed:', response.error);
                  }
                  expect(response.success).toBe(true);

                  // Verify all stored
                  const stored = await redis.smembers(
                    `session:${testSessionCode}:${bob.id}:selections`
                  );
                  expect(stored.length).toBe(5);

                  bob.close();
                  resolve();
                } catch (error) {
                  reject(error);
                }
              }
            );
          }
        );
      });
    });
  });

  it('should mark participant as submitted in metadata', async () => {
    const bob = ioClient(SOCKET_URL, { transports: ['websocket'] });

    await new Promise<void>((resolve, reject) => {
      bob.on('connect', () => {
        bob.emit(
          'session:join',
          { sessionCode: testSessionCode, displayName: 'Bob' },
          () => {
            bob.emit(
              'selection:submit',
              {
                sessionCode: testSessionCode,
                selections: [PLACE_IDS.place1],
              },
              async (response: any) => {
                try {
                  expect(response.success).toBe(true);

                  // Check submitted flag in participant metadata
                  const participantData = await redis.hgetall(`participant:${bob.id}`);
                  expect(participantData.hasSubmitted).toBe('1'); // Redis stores as '1' for true

                  bob.close();
                  resolve();
                } catch (error) {
                  reject(error);
                }
              }
            );
          }
        );
      });
    });
  });
});
