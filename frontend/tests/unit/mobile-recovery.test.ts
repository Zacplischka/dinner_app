import { describe, expect, it, vi } from 'vitest';

const device = vi.hoisted(() => ({
  preferences: new Map<string, string>(),
  credentials: new Map<string, string>(),
  join: vi.fn(),
  openOrder: vi.fn(),
  leave: vi.fn().mockResolvedValue({ success: true, data: null }),
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('../../src/services/supabase', () => ({
  supabase: null,
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: device.preferences.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => {
      device.preferences.set(key, value);
    },
    remove: async ({ key }: { key: string }) => {
      device.preferences.delete(key);
    },
  },
}));
vi.mock('capacitor-secure-storage-plugin', () => ({
  SecureStoragePlugin: {
    get: async ({ key }: { key: string }) => {
      if (!device.credentials.has(key)) throw new Error('Item with given key does not exist');
      return { value: device.credentials.get(key) };
    },
    set: async ({ key, value }: { key: string; value: string }) => {
      device.credentials.set(key, value);
    },
    remove: async ({ key }: { key: string }) => {
      device.credentials.delete(key);
    },
  },
}));
vi.mock('../../src/services/socketService', () => ({
  joinSession: device.join,
  leaveSession: device.leave,
  waitForConnection: async () => undefined,
  restartSession: vi.fn(),
  updateSessionChoices: vi.fn(),
  setSessionReady: vi.fn(),
  startSession: vi.fn(),
  removeSessionParticipant: vi.fn(),
  openOrder: device.openOrder,
  addOrderItem: vi.fn(),
  claimBuyer: vi.fn(),
}));

describe('native recovery through the shared socket boundary', () => {
  it('discards a stale basket when a cold native resume receives the same-round waiting Lobby', async () => {
    const participant = {
      participantId: 'old-socket',
      displayName: 'Alice',
      sessionCode: 'AB123',
      joinedAt: 1,
      hasSubmitted: false,
      isHost: false,
    };
    device.preferences.set(
      'dinner-session-storage',
      JSON.stringify({
        version: 1,
        state: {
          sessionCode: 'AB123',
          currentUserId: participant.participantId,
          participants: [participant],
          recoveryRound: 2,
          selections: ['old-recipe'],
          deckCursor: 5,
          orderPlaceId: 'old-venue',
        },
      })
    );
    device.credentials.set(
      'heykeen.rejoin',
      JSON.stringify({
        key: 'dinder:rejoin:AB123:Alice',
        token: 'secret-capability',
      })
    );
    vi.resetModules();
    const { useSessionStore } = await import('../../src/stores/sessionStore');
    const bindings = await import('../../src/services/socketBindings');
    await useSessionStore.persist.rehydrate();
    expect(useSessionStore.getState()).toMatchObject({
      lobby: undefined,
      recoveryRound: 2,
      orderPlaceId: 'old-venue',
      isConnected: false,
    });
    device.join.mockResolvedValue({
      success: true,
      data: {
        participantId: 'new-socket',
        rejoinToken: 'secret-capability',
        participants: [{ ...participant, participantId: 'new-socket' }],
        lobby: {
          sessionCode: 'AB123',
          branch: 'takeaway',
          state: 'waiting',
          round: 2,
          revision: 9,
          participants: [
            { ...participant, participantId: 'new-socket', isHost: true, ready: true },
          ],
        },
      },
    });
    device.openOrder.mockClear();
    device.openOrder.mockResolvedValue({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'That Venue was not this Session outcome' },
    });
    await bindings.reconcileSession();
    expect(device.openOrder).not.toHaveBeenCalled();
    expect(useSessionStore.getState()).toMatchObject({
      sessionCode: 'AB123',
      currentUserId: 'new-socket',
      sessionStatus: 'waiting',
      isConnected: true,
      orderPlaceId: null,
      selections: [],
      deckCursor: 0,
      participants: [{ displayName: 'Alice', isHost: true, ready: true }],
    });
    await vi.waitFor(() =>
      expect(JSON.parse(device.preferences.get('dinner-session-storage')!).state).toMatchObject({
        recoveryRound: 2,
        orderPlaceId: null,
        selections: [],
        deckCursor: 0,
      })
    );
    expect(device.preferences.get('dinner-session-storage')).not.toContain('"lobby"');
    await bindings.leaveSession('AB123');
  });

  it('recovers only with a secure capability, preserves transient failures, resets a missed round and clears Leave', async () => {
    let { useSessionStore } = await import('../../src/stores/sessionStore');
    let bindings = await import('../../src/services/socketBindings');
    const participant = { participantId: 'old-socket', displayName: 'Alice', isHost: true };
    const lobby = {
      sessionCode: 'AB123',
      branch: 'watch',
      state: 'selecting',
      revision: 3,
      round: 1,
      mealType: 'main course',
      participants: [{ ...participant, hasSubmitted: false }],
    };
    device.join.mockResolvedValue({
      success: true,
      data: {
        participantId: participant.participantId,
        rejoinToken: 'secret-capability',
        participants: [participant],
        lobby,
      },
    });
    await bindings.joinSession('AB123', 'Alice');
    useSessionStore.getState().setSelections(['movie-1']);
    useSessionStore.getState().setDeckCursor(2);
    useSessionStore.getState().setOrderPlaceId('previous-order');
    await vi.waitFor(() =>
      expect(device.preferences.get('dinner-session-storage')).toContain('movie-1')
    );
    const saved = device.preferences.get('dinner-session-storage')!;
    expect(saved).not.toMatch(/secret-capability|restaurants|allSelections|isConnected|"lobby"/);
    expect(device.credentials.get('heykeen.rejoin')).toContain('secret-capability');

    // New JS runtime, same OS storage. Hydration precedes socket initialization.
    vi.resetModules();
    ({ useSessionStore } = await import('../../src/stores/sessionStore'));
    bindings = await import('../../src/services/socketBindings');
    expect(useSessionStore.getState().sessionCode).toBeNull();
    await useSessionStore.persist.rehydrate();
    expect(useSessionStore.getState().isConnected).toBe(false);
    device.join.mockResolvedValue({
      success: false,
      error: { code: 'UNKNOWN', message: 'Temporary outage' },
    });
    await bindings.reconcileSession();
    expect(useSessionStore.getState()).toMatchObject({
      sessionCode: 'AB123',
      selections: ['movie-1'],
      isConnected: false,
    });
    expect(device.credentials.size).toBe(1);
    expect(device.join).toHaveBeenLastCalledWith('AB123', 'Alice', 'secret-capability');

    device.join.mockResolvedValue({
      success: true,
      data: {
        participantId: 'new-socket',
        rejoinToken: 'secret-capability',
        participants: [{ ...participant, participantId: 'new-socket' }],
        lobby: {
          ...lobby,
          round: 2,
          participants: [{ ...participant, participantId: 'new-socket' }],
        },
      },
    });
    await bindings.reconcileSession();
    expect(useSessionStore.getState()).toMatchObject({
      isConnected: true,
      selections: [],
      deckCursor: 0,
      orderPlaceId: null,
    });
    await bindings.leaveSession('AB123');
    expect(device.credentials.size).toBe(0);
    await vi.waitFor(() =>
      expect(device.preferences.get('dinner-session-storage')).not.toContain('Alice')
    );

    // A saved name without its credential must never become a tokenless join.
    useSessionStore.setState({
      sessionCode: 'AB123',
      currentUserId: 'old-socket',
      participants: [{ ...participant, joinedAt: 0, sessionCode: 'AB123', hasSubmitted: false }],
    });
    device.join.mockClear();
    await bindings.reconcileSession();
    expect(device.join).not.toHaveBeenCalled();
    expect(useSessionStore.getState()).toMatchObject({
      sessionCode: null,
      rejectedSessionCode: 'AB123',
    });
  });
});
