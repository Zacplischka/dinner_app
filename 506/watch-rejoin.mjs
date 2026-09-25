// #506 after-check against production: one Watch Session, synthetic names.
// Test Alex likes {A,B}, Test Sam likes {B,C}; Match {B} is broadcast; Sam Leaves
// from Results; Alex's socket drops and rejoins; then Alex Leaves too.
// Never prints the Session code. No order:open (no Supabase reads).
import { createRequire } from 'module';
import { isDeepStrictEqual } from 'node:util';
const require = createRequire(process.cwd() + '/backend/package.json'); // run from the repo root
const { io } = require('socket.io-client');

const URL = 'https://backend-production-4ce9.up.railway.app';
setTimeout(() => { console.log('timeout'); process.exit(2); }, 60000).unref();
const ok = (ack, what) => {
  if (!ack?.success) throw new Error(`${what} failed: ${JSON.stringify(ack?.error)}`);
  return ack.data;
};
const client = () =>
  new Promise((resolve, reject) => {
    const s = io(URL, { transports: ['websocket'], forceNew: true });
    s.once('connect', () => resolve(s));
    s.once('connect_error', reject);
  });
const summary = (r) => ({
  match: r?.overlappingOptions?.map((e) => e.name),
  topPick: r?.topPick && `${r.topPick.restaurant.name} (${r.topPick.likedBy}/${r.topPick.of})`,
  selectors: Object.keys(r?.allSelections ?? {}),
});

const created = await fetch(`${URL}/api/sessions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ hostName: 'Test Alex', branch: 'watch', collaborative: true, deckSize: 6 }),
});
if (created.status !== 201) throw new Error(`create ${created.status}`);
const { sessionCode } = await created.json();
console.log('created Watch Session <code masked>');

const alice = await client();
const bob = await client();
const aliceJoin = ok(await alice.emitWithAck('session:join', { sessionCode, displayName: 'Test Alex' }), 'alex join');
const bobJoin = ok(await bob.emitWithAck('session:join', { sessionCode, displayName: 'Test Sam' }), 'sam join');

const mood = { genres: ['Comedy'], decades: [], mediaTypes: ['movie'] };
let state = ok(await alice.emitWithAck('session:choices', { sessionCode, revision: bobJoin.lobby.revision, mood }), 'alex choices');
state = ok(await bob.emitWithAck('session:choices', { sessionCode, revision: state.revision, mood }), 'sam choices');
state = ok(await alice.emitWithAck('session:ready', { sessionCode, revision: state.revision, ready: true }), 'alex ready');
state = ok(await bob.emitWithAck('session:ready', { sessionCode, revision: state.revision, ready: true }), 'sam ready');
state = ok(await alice.emitWithAck('session:start', { sessionCode, revision: state.revision }), 'start');

const deck = (await fetch(`${URL}/api/options/${sessionCode}`).then((r) => r.json())).restaurants;
// Rank as rankTopPick breaks a 1-vote tie: rating desc, then name. A outranks B.
const ranked = [...deck].sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.name.localeCompare(b.name));
const [A, B, C] = ranked;
console.log('deck (ranked):', ranked.map((e) => `${e.name} ${e.rating}`).join(' | '));
console.log(`A=${A.name}  B=${B.name}  C=${C.name}`);

const broadcastP = new Promise((resolve) => alice.once('session:results', resolve));
ok(await alice.emitWithAck('selection:submit', { sessionCode, selections: [A.placeId, B.placeId], round: state.round }), 'alex submit');
ok(await bob.emitWithAck('selection:submit', { sessionCode, selections: [B.placeId, C.placeId], round: state.round }), 'sam submit');
const broadcast = await broadcastP;
console.log('BROADCAST:', JSON.stringify(summary(broadcast)));

ok(await bob.emitWithAck('session:leave', { sessionCode }), 'sam leave');
console.log('Test Sam left from Results');
alice.close();
bob.close();

const aliceAgain = await client();
const rejoin = ok(
  await aliceAgain.emitWithAck('session:join', { sessionCode, displayName: 'Test Alex', rejoinToken: aliceJoin.rejoinToken }),
  'alex rejoin'
);
console.log('REJOIN   :', JSON.stringify(summary(rejoin.results)), 'state=', rejoin.state);

const { sessionCode: _s1, ...b } = broadcast;
const { sessionCode: _s2, ...r } = rejoin.results ?? {};
console.log('rejoin.results deep-equals broadcast:', isDeepStrictEqual(b, r));
console.log('Top Pick equal:', broadcast.topPick?.restaurant.placeId === rejoin.results?.topPick?.restaurant.placeId);

ok(await aliceAgain.emitWithAck('session:leave', { sessionCode }), 'alex leave');
console.log('Test Alex left; Session has no Participants');
aliceAgain.close();
process.exit(0);
