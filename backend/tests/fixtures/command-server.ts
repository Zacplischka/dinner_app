// Actual production registrations in a disposable process. No provider or Redis calls.
import type { AddressInfo } from 'node:net';
import { app, httpServer, sessionService, sessionStore } from '../../src/server.js';
import { redis } from '../../src/redis/client.js';

redis.disconnect();
let calls = 0;
const reject = async (): Promise<never> => {
  calls++;
  throw new Error('isolated dependency failure');
};
sessionService.joinSession = reject;
sessionService.submitSelections = reject;
sessionService.restartSession = reject;
sessionService.leaveSession = reject;
sessionService.updateChoices = reject;
sessionService.setReady = reject;
sessionService.startRound = reject;
sessionService.removeAbsent = reject;
// Lobby's recovery read rejects *after* its first acknowledgement.
sessionService.getLobby = reject;
sessionStore.getParticipant = reject;
sessionStore.readSession = reject;
app.get('/test-calls', (_req, res) => res.json({ calls }));
httpServer.listen(0, '127.0.0.1', () => {
  process.send?.(`http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`);
});
