import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { ClientToServerEvents } from '@dinder/shared/types';

let child: ChildProcess;
let url: string;
let output = '';
const clients: Socket[] = [];
const payloads = {
  'session:join': { sessionCode: 'ABCDE', displayName: 'Local test' },
  'selection:submit': { sessionCode: 'ABCDE', selections: [] },
  'session:restart': { sessionCode: 'ABCDE' },
  'session:leave': { sessionCode: 'ABCDE' },
  'selection:live': { sessionCode: 'ABCDE', placeId: 'local' },
  'order:open': { sessionCode: 'ABCDE', placeId: 'local' },
  'order:item': { sessionCode: 'ABCDE', index: 0, delta: 1 },
  'order:buy': { sessionCode: 'ABCDE' },
  'session:choices': { sessionCode: 'ABCDE', revision: 0 },
  'session:ready': { sessionCode: 'ABCDE', revision: 0, ready: true },
  'session:start': { sessionCode: 'ABCDE', revision: 0 },
  'session:remove': { sessionCode: 'ABCDE', revision: 0, participantId: 'local' },
} satisfies { [E in keyof ClientToServerEvents]: Parameters<ClientToServerEvents[E]>[0] };

beforeAll(async () => {
  child = fork(fileURLToPath(new URL('../fixtures/command-server.ts', import.meta.url)), [], {
    execArgv: ['--unhandled-rejections=strict', '--import', 'tsx'],
    silent: true,
    env: {
      ...process.env,
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: '1',
      REDIS_PASSWORD: '',
      SUPABASE_URL: 'http://127.0.0.1:1',
      SUPABASE_SERVICE_ROLE_KEY: 'local-only',
      LOG_LEVEL: 'silent',
    },
  });
  child.stderr!.on('data', (chunk) => {
    output += String(chunk);
  });
  child.stdout!.on('data', (chunk) => {
    output += String(chunk);
  });
  url = await new Promise<string>((resolve, reject) => {
    child.once('message', (message) => resolve(String(message)));
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`Child exited ${code}: ${output}`)));
  });
});
afterAll(() => {
  clients.forEach((client) => client.disconnect());
  child?.kill('SIGKILL');
});
async function connect() {
  const client = io(url, { transports: ['websocket'], reconnection: false });
  clients.push(client);
  await new Promise<void>((resolve, reject) => {
    client.once('connect', resolve);
    client.once('connect_error', reject);
  });
  return client;
}

it('rejects absent/non-callable acknowledgements across every production command without domain calls or process failure', async () => {
  const malformed = await connect();
  for (const [event, payload] of Object.entries(payloads)) {
    malformed.emit(event, payload);
    for (const callback of [null, false, 42, 'callback', {}, []]) {
      malformed.emit(event, payload, callback);
    }
    // Ordered on the same connection: proves every preceding packet was dispatched.
    const response = await malformed.timeout(2000).emitWithAck(event, {});
    expect(response).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
  }
  expect(await (await fetch(`${url}/test-calls`)).json()).toEqual({ calls: 0 });
  const valid = await connect();
  expect(await valid.timeout(2000).emitWithAck('session:join', {})).toMatchObject({
    success: false,
    error: { code: 'VALIDATION_ERROR' },
  });
  expect(child.exitCode, output).toBeNull();
});

it('settles a rejected async Lobby recovery after acknowledging and keeps serving another client', async () => {
  const client = await connect();
  const response = await client
    .timeout(2000)
    .emitWithAck('session:ready', payloads['session:ready']);
  expect(response).toEqual({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again later.',
    },
  });
  expect(await (await fetch(`${url}/test-calls`)).json()).toEqual({ calls: 2 });
  const valid = await connect();
  expect(await valid.timeout(2000).emitWithAck('session:join', {})).toMatchObject({
    success: false,
    error: { code: 'VALIDATION_ERROR' },
  });
  expect(child.exitCode, output).toBeNull();
});
