import type { DeckEntry } from '@dinder/shared/types';
import type { Session, SessionStore } from '../../src/store/sessionStore.js';

/**
 * A Lobby Session its host has started: created, then dealt `entries` and
 * moved to 'selecting' by the same store write the lobby's startRound ends
 * with. `setup` is the created Session's (hostName, branch, headcount…) plus
 * what a deal records on it (cravingKey, mood, recipeSourceDown).
 */
export async function startedSession(
  store: SessionStore,
  sessionCode: string,
  entries: DeckEntry[],
  setup: Partial<Session> = {}
): Promise<void> {
  await store.createSession(sessionCode, { hostName: 'Alice', ...setup });
  const created = (await store.readSession(sessionCode))!;
  await store.startLobbyRound({ ...created, ...setup }, entries, created.lobby);
}
