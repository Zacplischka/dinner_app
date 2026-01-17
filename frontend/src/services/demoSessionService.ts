import type { Participant, Restaurant, Result } from '@dinder/shared/types';
import { GUIDE_RESTAURANTS, getGuideRestaurant } from '../demo/guideData';

export type DemoLocation = {
  latitude: number;
  longitude: number;
  address?: string;
};

type DemoSession = {
  sessionCode: string;
  createdAt: number;
  shareableLink: string;
  location?: DemoLocation;
  searchRadiusMiles?: number;
  participants: Participant[];
  selectionsByParticipantId: Record<string, string[]>; // participantId -> placeIds
};

const STORAGE_KEY = 'dinder_demo_sessions_v1';

function readAll(): Record<string, DemoSession> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, DemoSession>;
  } catch {
    return {};
  }
}

function writeAll(sessions: Record<string, DemoSession>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

function generateCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function newParticipant(displayName: string, sessionCode: string, isHost: boolean): Participant {
  return {
    participantId: `demo-${Math.random().toString(16).slice(2)}`,
    displayName,
    sessionCode,
    joinedAt: Date.now(),
    hasSubmitted: false,
    isHost,
  };
}

export function createDemoSession(params: {
  hostName: string;
  location?: DemoLocation;
  searchRadiusMiles?: number;
}): { sessionCode: string; shareableLink: string; host: Participant } {
  const sessions = readAll();
  let sessionCode = generateCode();
  while (sessions[sessionCode]) sessionCode = generateCode();

  const host = newParticipant(params.hostName, sessionCode, true);

  sessions[sessionCode] = {
    sessionCode,
    createdAt: Date.now(),
    shareableLink: `${window.location.origin}/join?code=${sessionCode}`,
    location: params.location,
    searchRadiusMiles: params.searchRadiusMiles,
    participants: [host],
    selectionsByParticipantId: {},
  };

  writeAll(sessions);
  return { sessionCode, shareableLink: sessions[sessionCode].shareableLink, host };
}

export function getDemoSession(sessionCode: string): DemoSession {
  const sessions = readAll();
  const session = sessions[sessionCode];
  if (!session) throw new Error('Session not found');
  return session;
}

export function joinDemoSession(sessionCode: string, displayName: string): Participant {
  const sessions = readAll();
  const session = sessions[sessionCode];
  if (!session) throw new Error('Session not found');

  if (session.participants.length >= 4) throw new Error('Session is full');

  const participant = newParticipant(displayName, sessionCode, false);
  session.participants.push(participant);
  sessions[sessionCode] = session;
  writeAll(sessions);
  return participant;
}

export function leaveDemoSession(sessionCode: string, participantId: string): void {
  const sessions = readAll();
  const session = sessions[sessionCode];
  if (!session) return;

  session.participants = session.participants.filter((p) => p.participantId !== participantId);
  delete session.selectionsByParticipantId[participantId];
  sessions[sessionCode] = session;
  writeAll(sessions);
}

export function addDemoFriends(sessionCode: string, count: number): Participant[] {
  const sessions = readAll();
  const session = sessions[sessionCode];
  if (!session) throw new Error('Session not found');

  const created: Participant[] = [];
  const names = ['Ava', 'Noah', 'Mia', 'Leo', 'Zoe', 'Ethan'];

  while (created.length < count && session.participants.length < 4) {
    const name = names[(session.participants.length + created.length) % names.length];
    const p = newParticipant(name, sessionCode, false);
    session.participants.push(p);
    created.push(p);
  }

  sessions[sessionCode] = session;
  writeAll(sessions);
  return created;
}

export function getDemoRestaurants(_sessionCode: string): Restaurant[] {
  // For the demo, always return the same pool.
  return GUIDE_RESTAURANTS as Restaurant[];
}

export function submitDemoSelection(sessionCode: string, participantId: string, selections: string[]) {
  const sessions = readAll();
  const session = sessions[sessionCode];
  if (!session) throw new Error('Session not found');

  session.selectionsByParticipantId[participantId] = selections;
  session.participants = session.participants.map((p) =>
    p.participantId === participantId ? { ...p, hasSubmitted: true } : p
  );

  sessions[sessionCode] = session;
  writeAll(sessions);
}

export function isDemoSessionComplete(sessionCode: string): boolean {
  const s = getDemoSession(sessionCode);
  return s.participants.length > 0 && s.participants.every((p) => p.hasSubmitted);
}

export function computeDemoResults(sessionCode: string): Result {
  const s = getDemoSession(sessionCode);

  // displayName -> selections
  const allSelections: Record<string, string[]> = {};
  const restaurantNames: Record<string, string> = {};

  for (const r of GUIDE_RESTAURANTS) restaurantNames[r.placeId] = r.name;

  for (const p of s.participants) {
    allSelections[p.displayName] = s.selectionsByParticipantId[p.participantId] || [];
  }

  // compute overlap
  const selectionLists = Object.values(allSelections);
  const overlapIds = selectionLists.length
    ? selectionLists.reduce((acc, arr) => acc.filter((id) => arr.includes(id)), [...selectionLists[0]])
    : [];

  const overlappingOptions = overlapIds
    .map((id) => getGuideRestaurant(id))
    .filter(Boolean) as Restaurant[];

  const hasOverlap = overlappingOptions.length > 0;

  // If no overlap, return top-voted restaurants (count >= 2) as "matches"
  if (!hasOverlap) {
    const counts = new Map<string, number>();
    for (const ids of selectionLists) {
      for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);
    }
    const ranked = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .filter(([, c]) => c >= 2)
      .slice(0, 5)
      .map(([id]) => getGuideRestaurant(id))
      .filter(Boolean) as Restaurant[];

    return {
      sessionCode,
      overlappingOptions: ranked,
      allSelections,
      restaurantNames,
      hasOverlap: ranked.length > 0,
    };
  }

  return {
    sessionCode,
    overlappingOptions,
    allSelections,
    restaurantNames,
    hasOverlap,
  };
}

export function restartDemoSession(sessionCode: string) {
  const sessions = readAll();
  const s = sessions[sessionCode];
  if (!s) return;

  s.selectionsByParticipantId = {};
  s.participants = s.participants.map((p) => ({ ...p, hasSubmitted: false }));
  sessions[sessionCode] = s;
  writeAll(sessions);
}

export function simulateRemainingSubmissions(sessionCode: string) {
  const sessions = readAll();
  const session = sessions[sessionCode];
  if (!session) throw new Error('Session not found');

  const pool = GUIDE_RESTAURANTS.map((r) => r.placeId);

  for (const p of session.participants) {
    if (p.hasSubmitted) continue;

    // Pick 3-6 random likes
    const count = Math.max(3, Math.min(6, Math.floor(Math.random() * 6) + 2));
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    const picks = shuffled.slice(0, count);

    session.selectionsByParticipantId[p.participantId] = picks;
    p.hasSubmitted = true;
  }

  sessions[sessionCode] = session;
  writeAll(sessions);
}
