import type { Cuisine, Diet, MealType } from './cook.js';
import type { Branch } from './models.js';
import type { SessionLocation } from './session-contract.js';
import type { Mood } from './watch.js';

/** Additive gather-first lifecycle. Absence means a legacy Session. */
export interface LobbyParticipant {
  participantId: string;
  displayName: string;
  isHost: boolean;
  isOnline: boolean;
  hasSubmitted: boolean;
  ready: boolean;
  /** A Cook newcomer awaiting dietary admission; not counted in the current Match. */
  waitingForNextRound: boolean;
  mood?: Mood;
  cuisines?: Cuisine[];
  diets?: Diet[];
}

export interface SessionLobbyState {
  sessionCode: string;
  state: 'waiting' | 'selecting' | 'complete' | 'expired';
  branch: Branch;
  revision: number;
  /** Stable through active-round joins and next-round choice edits. */
  round?: number;
  participants: LobbyParticipant[];
  mealType: MealType;
  headcount: number;
  deckSize: number;
  location?: SessionLocation;
  searchRadiusMiles: number;
  starting?: boolean;
  notice?: string;
}

export interface SessionLobbyPayload {
  sessionCode: string;
  revision: number;
}
export interface SessionChoicesPayload extends SessionLobbyPayload {
  mood?: Mood;
  cuisines?: Cuisine[];
  diets?: Diet[];
  mealType?: MealType;
  headcount?: number;
  deckSize?: number;
  location?: SessionLocation;
  searchRadiusMiles?: number;
}
export interface SessionReadyPayload extends SessionLobbyPayload {
  ready: boolean;
}
export interface SessionRemovePayload extends SessionLobbyPayload {
  participantId: string;
}
