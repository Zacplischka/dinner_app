import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SessionResultsEvent,
} from '@dinder/shared/types';
import { sessionStore } from '../../src/server.js';
import { getTestRedis, cleanupTestData } from '../helpers/testSetup.js';
import { startSocketServer, stopSocketServer } from '../helpers/socketServer.js';

let url: string;
const redis = getTestRedis();
beforeAll(async () => {
  url = await startSocketServer();
});
beforeEach(async () => {
  await cleanupTestData(redis);
});
afterAll(async () => {
  await cleanupTestData(redis);
  await stopSocketServer();
});

describe('accepted display names on the Selection transport', () => {
  it.each(['__proto__', 'constructor', 'toString'])(
    'preserves %s through join, submit and results',
    async (displayName) => {
      const code = 'NME23';
      await sessionStore.createSession(code, {
        hostId: 'absent-host',
        hostName: 'Host',
        entries: [{ placeId: 'pizza', name: 'Pizza' }],
      });
      const socket: Socket<ServerToClientEvents, ClientToServerEvents> = connect(url, {
        transports: ['websocket'],
      });
      try {
        await new Promise<void>((resolve, reject) => {
          socket.on('connect', resolve);
          socket.on('connect_error', reject);
        });
        const joined = await socket.emitWithAck('session:join', { sessionCode: code, displayName });
        expect(joined.success).toBe(true);
        const results = new Promise<SessionResultsEvent>((resolve) =>
          socket.once('session:results', resolve)
        );
        const submitted = await socket.emitWithAck('selection:submit', {
          sessionCode: code,
          selections: ['pizza'],
        });
        expect(submitted.success).toBe(true);
        const wire = await results;
        expect(Object.prototype.hasOwnProperty.call(wire.allSelections, displayName)).toBe(true);
        expect(wire.allSelections[displayName]).toEqual(['pizza']);
      } finally {
        socket.disconnect();
      }
    }
  );
});
