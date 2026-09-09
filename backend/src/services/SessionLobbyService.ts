import type {
  Craving,
  DeckEntry,
  SessionChoicesPayload,
  SessionLobbyState,
  SessionLocation,
} from '@dinder/shared/types';
import type { Session, Participant } from '../store/sessionStore.js';
import type { SessionServiceDeps } from './SessionService.js';
import { cravingPoolKey, satisfiesDiets } from './RecipePoolService.js';
import { DomainError } from './DomainError.js';

export function createLobbyCommands(
  deps: Pick<
    SessionServiceDeps,
    | 'store'
    | 'searchNearbyRestaurants'
    | 'dealMovieDeck'
    | 'redealMovieDeck'
    | 'dealRecipeDeck'
    | 'dealCollaborativeRecipeDeck'
  >
) {
  const { store } = deps;

  async function readLobby(sessionCode: string): Promise<SessionLobbyState | undefined> {
    const session = await store.readSession(sessionCode);
    if (!session?.lobby || !session.branch) return undefined;
    const participants = await store.listParticipants(sessionCode);
    return {
      sessionCode,
      state: session.state,
      branch: session.branch,
      ...session.lobby,
      headcount: session.headcount ?? 2,
      deckSize: session.deckSize ?? 15,
      location: session.location,
      searchRadiusMiles: session.searchRadiusMiles ?? 5,
      participants: participants.map((p) => ({
        participantId: p.participantId,
        displayName: p.displayName,
        avatarUrl: p.avatarUrl,
        isHost: p.isHost,
        isOnline: p.isOnline,
        hasSubmitted: p.hasSubmitted,
        ready: p.ready === true,
        waitingForNextRound: p.waitingForNextRound === true,
        mood: p.mood,
        cuisines: p.cuisines,
        diets: p.diets,
      })),
    };
  }

  async function getLobby(sessionCode: string): Promise<SessionLobbyState | undefined> {
    if (!(await store.readSession(sessionCode))?.lobby) return undefined;
    return store.withSessionLock(sessionCode, () => readLobby(sessionCode));
  }

  async function context(sessionCode: string, participantId: string, revision?: number) {
    const session = await store.readSession(sessionCode);
    if (!session) throw new DomainError('SESSION_NOT_FOUND', 'Session not found or has expired');
    if (!session.lobby)
      throw new DomainError('VALIDATION_ERROR', 'This session uses the original setup.');
    const roster = await store.listParticipants(sessionCode);
    const me = roster.find((p) => p.participantId === participantId);
    if (!me)
      throw new DomainError(
        'NOT_IN_SESSION',
        'You are no longer in this session. Join again to take part.'
      );
    if (revision !== undefined && revision !== session.lobby.revision) {
      throw new DomainError(
        'VALIDATION_ERROR',
        'The choices changed. Review the latest choices and try again.'
      );
    }
    return { session, roster, me };
  }

  function requireHost(roster: Participant[], me: Participant) {
    if (me.waitingForNextRound || (!me.isHost && roster.some((p) => p.isHost && p.isOnline))) {
      throw new DomainError('NOT_HOST', 'Only the host can do this.');
    }
  }

  async function updated(session: Session) {
    session.lobby = {
      ...session.lobby!,
      revision: session.lobby!.revision + 1,
      starting: false,
      notice: undefined,
    };
    await store.writeLobbySession(session);
    return (await getLobby(session.sessionCode))!;
  }

  async function updateChoices(
    sessionCode: string,
    participantId: string,
    payload: SessionChoicesPayload
  ) {
    return store.withSessionLock(sessionCode, async () => {
      const { session, roster, me } = await context(sessionCode, participantId, payload.revision);
      const shared =
        payload.mealType !== undefined ||
        payload.location !== undefined ||
        payload.searchRadiusMiles !== undefined ||
        payload.headcount !== undefined ||
        payload.deckSize !== undefined;
      if (shared && session.state !== 'waiting')
        throw new DomainError(
          'VALIDATION_ERROR',
          'Shared choices can change in the lobby before the next round.'
        );
      if (payload.headcount !== undefined || payload.deckSize !== undefined)
        requireHost(roster, me);
      if (payload.mood !== undefined && session.branch !== 'watch')
        throw new DomainError('VALIDATION_ERROR', 'Genres belong to a Watch session.');
      if (
        (payload.cuisines !== undefined ||
          payload.diets !== undefined ||
          payload.mealType !== undefined ||
          payload.headcount !== undefined) &&
        session.branch !== 'cook'
      ) {
        throw new DomainError('VALIDATION_ERROR', 'These choices belong to a Cook session.');
      }
      if (
        (payload.location !== undefined || payload.searchRadiusMiles !== undefined) &&
        (session.branch === 'cook' || session.branch === 'watch')
      ) {
        throw new DomainError(
          'VALIDATION_ERROR',
          'The search area belongs to Eat Out or Takeaway.'
        );
      }
      if (
        payload.deckSize !== undefined &&
        (session.branch === 'eatout' || session.branch === 'takeaway') &&
        payload.deckSize > 20
      ) {
        throw new DomainError('VALIDATION_ERROR', 'The largest Restaurant deck is 20.');
      }
      const changed =
        shared ||
        payload.mood !== undefined ||
        payload.cuisines !== undefined ||
        payload.diets !== undefined;
      if (!changed) return (await getLobby(sessionCode))!;
      if (shared)
        for (const p of roster)
          await store.writeParticipantChoices(p.participantId, { ready: false });
      await store.writeParticipantChoices(participantId, {
        mood: payload.mood,
        cuisines: payload.cuisines,
        diets: payload.diets,
        ready: false,
      });
      if (payload.mealType !== undefined) session.lobby!.mealType = payload.mealType;
      if (payload.headcount !== undefined) session.headcount = payload.headcount;
      if (payload.deckSize !== undefined) session.deckSize = payload.deckSize;
      if (payload.location !== undefined) session.location = payload.location;
      if (payload.searchRadiusMiles !== undefined)
        session.searchRadiusMiles = payload.searchRadiusMiles;
      // A newcomer explicitly supplies even an empty diet list before admission.
      if (me.waitingForNextRound && session.state === 'selecting' && payload.diets !== undefined) {
        const { entries } = await store.getDeck(sessionCode);
        const compatible =
          entries.length > 0 &&
          entries.every(
            (entry) => entry.kind === 'recipe' && satisfiesDiets(entry.diets, payload.diets!)
          );
        if (compatible) {
          await store.writeParticipantChoices(participantId, { waitingForNextRound: false });
          await store.setParticipantCount(
            sessionCode,
            roster.filter((p) => !p.waitingForNextRound).length + 1
          );
        }
      }
      return updated(session);
    });
  }

  async function setReady(
    sessionCode: string,
    participantId: string,
    revision: number,
    ready: boolean
  ) {
    return store.withSessionLock(sessionCode, async () => {
      const { session } = await context(sessionCode, participantId, revision);
      if (session.state !== 'waiting')
        throw new DomainError(
          'VALIDATION_ERROR',
          'This round has already started. Your choices apply next round.'
        );
      await store.writeParticipantChoices(participantId, { ready });
      return updated(session);
    });
  }

  async function removeAbsent(
    sessionCode: string,
    participantId: string,
    revision: number,
    targetId: string
  ) {
    return store.withSessionLock(sessionCode, async () => {
      const { session, roster, me } = await context(sessionCode, participantId, revision);
      requireHost(roster, me);
      const target = roster.find((p) => p.participantId === targetId);
      if (
        session.state !== 'waiting' ||
        !target ||
        target.isOnline ||
        target.ready ||
        targetId === participantId
      ) {
        throw new DomainError(
          'VALIDATION_ERROR',
          'Only an absent participant who has not confirmed Ready can be removed.'
        );
      }
      await store.removeParticipant(sessionCode, targetId);
      if (target.isHost) session.hostSlotReleased = true;
      const remaining = roster.filter((p) => p.participantId !== targetId);
      await store.setParticipantCount(sessionCode, remaining.length);
      return updated(session);
    });
  }

  async function startRound(sessionCode: string, participantId: string, revision: number) {
    const snapshot = await store.withSessionLock(sessionCode, async () => {
      const { session, roster, me } = await context(sessionCode, participantId, revision);
      requireHost(roster, me);
      if (session.state !== 'waiting' || session.lobby!.starting)
        throw new DomainError(
          'VALIDATION_ERROR',
          'The round has already started or is being prepared.'
        );
      if (!roster.length || roster.some((p) => !p.ready || p.waitingForNextRound))
        throw new DomainError(
          'VALIDATION_ERROR',
          'Everyone must confirm Ready before the host starts.'
        );
      if ((session.branch === 'eatout' || session.branch === 'takeaway') && !session.location)
        throw new DomainError('VALIDATION_ERROR', 'Choose a shared search area first.');
      session.lobby!.starting = true;
      session.lobby!.revision++;
      session.lobby!.notice = undefined;
      await store.writeLobbySession(session);
      return {
        session,
        roster: [...roster].sort((a, b) => a.displayName.localeCompare(b.displayName)),
        current: (await store.getDeck(sessionCode)).entries,
      };
    });
    const { session, roster, current } = snapshot;
    let entries: DeckEntry[];
    try {
      if (session.branch === 'watch') {
        const interests = roster.map((p) => p.mood ?? { genres: [], decades: [], mediaTypes: [] });
        session.mood = {
          genres: [...new Set(interests.flatMap((m) => m.genres))],
          decades: [...new Set(interests.flatMap((m) => m.decades))],
          mediaTypes: [...new Set(interests.flatMap((m) => m.mediaTypes ?? []))],
        };
        entries = deps.redealMovieDeck(session.mood, current, session.deckSize, interests);
        if (!entries.length)
          throw new DomainError(
            'NO_MOVIES_FOUND',
            'No movies or series match these interests. Adjust your choices and try again.'
          );
      } else if (session.branch === 'cook') {
        const craving: Craving = {
          mealType: session.lobby!.mealType,
          cuisines: [...new Set(roster.flatMap((p) => p.cuisines ?? []))],
          diets: [...new Set(roster.flatMap((p) => p.diets ?? []))],
        };
        const dealt = await (
          deps.dealCollaborativeRecipeDeck
            ? deps.dealCollaborativeRecipeDeck(
                craving,
                roster.map((p) => p.cuisines ?? []),
                current,
                session.deckSize
              )
            : deps.dealRecipeDeck(craving, session.deckSize)
        ).catch((error: unknown) => {
          if (error instanceof DomainError) throw error;
          throw new DomainError(
            'RECIPE_SOURCE_UNAVAILABLE',
            "Couldn't load recipes just now. Try again in a moment."
          );
        });
        entries = dealt.entries.filter(
          (e) => e.kind === 'recipe' && satisfiesDiets(e.diets, craving.diets)
        );
        if (!entries.length)
          throw new DomainError(
            'NO_RECIPES_FOUND',
            'No recipes meet every dietary requirement and the shared meal type. Review your choices together; no diet has been relaxed.'
          );
        session.cravingKey = cravingPoolKey(craving);
        session.recipeSourceDown = dealt.recipeSourceDown;
      } else {
        const location = session.location as SessionLocation;
        const searchKey = JSON.stringify([
          location.latitude,
          location.longitude,
          session.searchRadiusMiles ?? 5,
          session.deckSize ?? 20,
        ]);
        entries =
          session.dealtSearch === searchKey && current.length
            ? current
            : await deps.searchNearbyRestaurants({
                ...location,
                radiusMeters: (session.searchRadiusMiles ?? 5) * 1609.34,
                maxResults: session.deckSize ?? 20,
              });
        session.dealtSearch = searchKey;
        if (!entries.length)
          throw new DomainError(
            'NO_RESTAURANTS_FOUND',
            'No restaurants found in that area. Adjust the location or radius and try again.'
          );
      }
    } catch (error) {
      await store.withSessionLock(sessionCode, async () => {
        const latest = await store.readSession(sessionCode);
        if (latest?.lobby?.revision === session.lobby!.revision) {
          latest.lobby.starting = false;
          latest.lobby.revision++;
          latest.lobby.notice =
            error instanceof DomainError
              ? error.message
              : 'The search could not finish. Try again in a moment.';
          await store.writeLobbySession(latest);
        }
      });
      throw error;
    }
    return store.withSessionLock(sessionCode, async () => {
      const latest = await store.readSession(sessionCode);
      if (
        !latest?.lobby ||
        latest.state !== 'waiting' ||
        latest.lobby.revision !== session.lobby!.revision ||
        !latest.lobby.starting
      ) {
        throw new DomainError(
          'VALIDATION_ERROR',
          'The group or choices changed while preparing the deck. Review Ready and start again.'
        );
      }
      session.lobby!.starting = false;
      session.lobby!.revision++;
      session.lobby!.notice =
        entries.length < (session.deckSize ?? 15)
          ? `Only ${entries.length} options match the current choices.`
          : undefined;
      if (session.branch === 'watch') {
        const media = new Set(
          entries.flatMap((e) => (e.kind === 'movie' ? [e.mediaType ?? 'movie'] : []))
        );
        if (
          (session.mood?.mediaTypes?.length ?? 0) !== 1 &&
          media.size === 1 &&
          entries.length > 1
        ) {
          session.lobby!.notice = `Only ${media.has('tv') ? 'series' : 'movies'} are available for these interests.`;
        }
      }
      session.lobby!.round = session.lobby!.revision;
      if (!(await store.startLobbyRound(session, entries, latest.lobby))) {
        throw new DomainError(
          'VALIDATION_ERROR',
          'The group changed. Review Ready and start again.'
        );
      }
      return (await getLobby(sessionCode))!;
    });
  }

  return { getLobby, updateChoices, setReady, removeAbsent, startRound };
}
