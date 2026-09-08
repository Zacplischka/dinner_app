import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useNavigate, useParams } from 'react-router-dom';
import type { Ack, SessionChoicesPayload, SessionLobbyState } from '@dinder/shared/types';
import { useSessionStore } from '../stores/sessionStore';
import { useFriendsStore } from '../stores/friendsStore';
import { getSession } from '../services/apiClient';
import {
  restartSession,
  startSession,
  setSessionReady,
  updateSessionChoices,
  removeSessionParticipant,
} from '../services/socketBindings';
import { useLeaveSession } from '../hooks/useLeaveSession';
import { useShareLink } from '../hooks/useShareLink';
import { useToast } from '../hooks/useToast';
import { participantRingClass } from '../utils/participantStyles';
import NavigationHeader from '../components/NavigationHeader';
import InviteFriendsSection from '../components/friends/InviteFriendsSection';
import LobbyChoices from '../components/LobbyChoices';
import Spinner from '../components/Spinner';
import TmdbCredit from '../components/TmdbCredit';
import SocialMoment from '../components/SocialMoment';

export default function SessionLobbyPage() {
  const navigate = useNavigate();
  const { sessionCode } = useParams<{ sessionCode: string }>();
  const { participants, isConnected, sessionStatus, setExpiresAt, currentUserId, lobby, setLobby } =
    useSessionStore();
  const [shareableLink, setShareableLink] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());
  const inFlight = useRef(false);
  const fetchFailed = useRef(false);
  const roster = participants.map((p) => p.participantId).join(',');
  const toast = useToast();
  const inviteFriends = useFriendsStore((state) => state.inviteFriendsToSession);
  const me = participants.find((p) => p.participantId === currentUserId);
  const isHost = !!me && (me.isHost || !participants.some((p) => p.isHost && p.isOnline !== false));
  const pendingPeople = lobby?.participants.filter((p) => p.waitingForNextRound) ?? [];
  const reviewingWaiting = isHost && pendingPeople.length > 0;
  const disabled = busy || !isConnected || !!lobby?.starting;

  useEffect(() => {
    let active = true;
    if (!sessionCode) {
      setIsLoading(false);
      return;
    }
    void getSession(sessionCode)
      .then((session) => {
        if (!active) return;
        fetchFailed.current = false;
        setShareableLink(session.shareableLink);
        setExpiresAt(session.expiresAt);
        if (session.lobby) setLobby(session.lobby);
      })
      .catch((failure: unknown) => {
        if (active && !fetchFailed.current)
          toast.error(failure instanceof Error ? failure.message : 'Failed to load session');
        fetchFailed.current = true;
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [sessionCode, roster, setExpiresAt, setLobby, toast]);

  useEffect(() => {
    if (!sessionCode || me?.waitingForNextRound || reviewingWaiting) return;
    if (sessionStatus === 'selecting') navigate(`/session/${sessionCode}/select`);
    if (sessionStatus === 'complete') navigate(`/session/${sessionCode}/results`);
  }, [navigate, sessionCode, sessionStatus, me?.waitingForNextRound, reviewingWaiting]);

  const share = useShareLink(shareableLink, 'Link copied to clipboard!');
  const leave = useLeaveSession(sessionCode);

  async function run(command: () => Promise<Ack<SessionLobbyState> | Ack<null>>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const ack = await command();
      if (ack.success) {
        if (ack.data) setLobby(ack.data);
      } else {
        setError(ack.error.message);
        // A stale revision never overwrites another Participant's choices.
        if (sessionCode) {
          const current = await getSession(sessionCode).catch(() => null);
          if (current?.lobby) setLobby(current.lobby);
        }
      }
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Could not update the session. Try again.'
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  function change(choices: Omit<SessionChoicesPayload, 'sessionCode' | 'revision'>) {
    if (!lobby) return Promise.resolve();
    const personal = Object.keys(choices).every((key) =>
      ['mood', 'cuisines', 'diets'].includes(key)
    );
    // Retry only unrelated personal edits. Another tab changing my choices,
    // shared settings, roster or round must still ask me to review them.
    const context = (state: SessionLobbyState) =>
      JSON.stringify([
        state.state,
        state.branch,
        state.round,
        state.starting ?? false,
        state.mealType,
        state.headcount,
        state.deckSize,
        state.location,
        state.searchRadiusMiles,
        state.participants.map((p) => [p.participantId, p.isHost, p.waitingForNextRound]),
        state.participants.find((p) => p.participantId === currentUserId),
      ]);
    const original = context(lobby);
    return run(async () => {
      let current = lobby;
      // ponytail: three retries cover the other three Participants; sustained
      // editing surfaces the existing error instead of retrying indefinitely.
      for (let attempt = 0; ; attempt++) {
        const ack = await updateSessionChoices({
          sessionCode: current.sessionCode,
          revision: current.revision,
          ...choices,
        });
        if (
          ack.success ||
          !personal ||
          lobby.state !== 'waiting' ||
          attempt === 3 ||
          ack.error.code !== 'VALIDATION_ERROR'
        )
          return ack;
        const latest = (await getSession(lobby.sessionCode)).lobby;
        if (!latest || latest.revision <= current.revision || context(latest) !== original)
          return ack;
        current = latest;
      }
    });
  }

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView?.({ block: 'center' });
  }, [error]);

  if (isLoading)
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink">
        <Spinner size="lg" label="Loading session…" />
      </main>
    );

  return (
    <main className="market-backdrop min-h-screen">
      <NavigationHeader
        title={
          lobby
            ? { watch: 'Watch', cook: 'Cook', eatout: 'Eat out', takeaway: 'Order in' }[
                lobby.branch
              ]
            : 'Make the call'
        }
        subtitle="Invite friends. Choose together. Get ready."
        sessionCode={sessionCode}
        showBackButton
        onBack={leave}
        confirmOnBack
        confirmContext="lobby"
        showConnectionStatus
      />
      <div className="mx-auto max-w-md space-y-3 px-4 py-4 animate-fade-in">
        <section className="card px-4 py-3" aria-labelledby="invite-title">
          <h2 id="invite-title" className="label text-center">
            Session code
          </h2>
          <div className="rounded-market-md border border-cyan bg-surface px-4 py-2 text-center font-mono text-3xl font-black tracking-[0.28em] text-cyan shadow-glow-cyan">
            {sessionCode}
          </div>
          {shareableLink && (
            <button
              className="btn btn-secondary mt-4 min-h-[48px] w-full text-sm"
              onClick={() => void share()}
            >
              {Capacitor.isNativePlatform() || typeof navigator.share === 'function'
                ? 'Share invite link'
                : 'Copy shareable link'}
            </button>
          )}
          <div className="mt-4">
            <InviteFriendsSection
              selectedFriendIds={selectedFriends}
              onSelectionChange={setSelectedFriends}
              disabled={disabled}
              description="Select friends to invite to this session"
            />
          </div>
          {selectedFriends.size > 0 && (
            <button
              className="btn btn-secondary mt-3 w-full min-h-[48px]"
              disabled={disabled}
              onClick={() => {
                void (async () => {
                  if (!sessionCode) return;
                  setBusy(true);
                  try {
                    if (await inviteFriends(sessionCode, [...selectedFriends])) {
                      setSelectedFriends(new Set());
                      toast.success('Invitations sent');
                    } else
                      toast.error(
                        `Could not send invitations. Share the code ${sessionCode} instead.`
                      );
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              Send invitations
            </button>
          )}
        </section>

        <section className="card p-4" aria-labelledby="participants-title">
          <h2 id="participants-title" className="mb-3 text-lg font-display font-semibold">
            Participants <span className="text-cyan">({participants.length})</span>
          </h2>
          <div className="space-y-2" data-testid="participants-list" aria-live="polite">
            {participants.map((participant, index) => {
              const offline = participant.isOnline === false;
              const choices = lobby?.participants.find(
                (p) => p.participantId === participant.participantId
              );
              const interests =
                lobby?.branch === 'watch'
                  ? [
                      ...(choices?.mood?.mediaTypes ?? []).map((type) =>
                        type === 'tv' ? 'Series' : 'Movies'
                      ),
                      ...(choices?.mood?.genres ?? []),
                      ...(choices?.mood?.decades ?? []),
                    ]
                  : [...(choices?.cuisines ?? []), ...(choices?.diets ?? [])];
              return (
                <div
                  key={participant.participantId}
                  data-testid="participant"
                  className="rounded-xl border border-line bg-surface/70 p-2"
                >
                  <div className="flex items-center gap-3">
                    <div
                      aria-label={`${participant.displayName}${participant.isHost ? ', host' : ''}, ${offline ? 'offline' : 'live'}`}
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 bg-raised font-black ${participantRingClass(index)}`}
                    >
                      {participant.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        <span data-testid="participant-name">{participant.displayName}</span>
                        {participant.isHost && (
                          <span className="ml-2 text-xs font-semibold text-cyan">Host</span>
                        )}
                      </p>
                      <p className="text-xs text-muted">
                        {offline ? 'Offline' : 'Live'}
                        {lobby
                          ? participant.waitingForNextRound
                            ? ' · Waiting for dietary check / next round'
                            : participant.ready
                              ? ' · Ready'
                              : ' · Not ready'
                          : ''}
                      </p>
                    </div>
                  </div>
                  {lobby && (lobby.branch === 'watch' || lobby.branch === 'cook') && (
                    <p className="mt-2 text-xs text-muted">
                      {interests.length ? interests.join(', ') : 'Happy with anything'}
                    </p>
                  )}
                  {lobby?.state === 'waiting' &&
                    isHost &&
                    offline &&
                    !participant.ready &&
                    participant.participantId !== currentUserId && (
                      <button
                        className="mt-2 min-h-[44px] text-sm font-bold text-coral-soft"
                        disabled={disabled}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Remove ${participant.displayName} from this session? They have not confirmed Ready and can join again later.`
                            )
                          )
                            void run(() =>
                              removeSessionParticipant({
                                sessionCode: lobby.sessionCode,
                                revision: lobby.revision,
                                participantId: participant.participantId,
                              })
                            );
                        }}
                      >
                        Remove {participant.displayName}
                      </button>
                    )}
                </div>
              );
            })}
          </div>

          <div className="mt-4 space-y-3">
            {lobby?.state === 'waiting' && me && (
              <div className="space-y-3">
                <button
                  className="btn btn-secondary min-h-[48px] w-full"
                  aria-pressed={!!me.ready}
                  disabled={disabled}
                  onClick={() =>
                    void run(() =>
                      setSessionReady({
                        sessionCode: lobby.sessionCode,
                        revision: lobby.revision,
                        ready: !me.ready,
                      })
                    )
                  }
                >
                  {me.ready ? 'Ready — change my confirmation' : 'I’m ready'}
                </button>
                <p className="text-center text-xs text-muted">
                  {lobby.participants.filter((p) => p.ready).length} of {lobby.participants.length}{' '}
                  ready. Everyone, including the host, confirms.
                </p>
              </div>
            )}

            {(!lobby || lobby.state === 'waiting') &&
              (isHost ? (
                <button
                  className="btn btn-primary min-h-[48px] w-full text-lg"
                  disabled={
                    lobby
                      ? disabled ||
                        !lobby.participants.length ||
                        !lobby.participants.every((p) => p.ready) ||
                        ((lobby.branch === 'eatout' || lobby.branch === 'takeaway') &&
                          !lobby.location)
                      : participants.length === 0
                  }
                  onClick={() => {
                    if (!sessionCode) return;
                    void run(() =>
                      lobby
                        ? startSession({ sessionCode, revision: lobby.revision })
                        : restartSession(sessionCode)
                    );
                  }}
                >
                  {lobby?.starting
                    ? 'Finding your shared deck…'
                    : lobby
                      ? 'Start swiping'
                      : 'Start Selecting'}
                </button>
              ) : (
                <p className="rounded-xl border border-dashed border-line py-4 text-center text-sm text-muted">
                  Waiting for the host to start
                </p>
              ))}
          </div>
        </section>

        {!isConnected && (
          <p
            role="status"
            className="rounded-xl border border-amber/30 bg-amber/10 p-3 text-sm text-amber"
          >
            Disconnected from server. Your place and choices are saved; reconnect to continue.
          </p>
        )}
        {lobby?.notice && (
          <p
            role="status"
            className="rounded-xl border border-amber/30 bg-amber/10 p-3 text-sm text-amber"
          >
            {lobby.notice}
          </p>
        )}
        {error && (
          <p
            ref={errorRef}
            role="alert"
            className="rounded-xl border border-coral/30 bg-coral/10 p-3 text-sm text-coral-soft"
          >
            {error}
          </p>
        )}
        {lobby && (
          <LobbyChoices
            key={`${lobby.sessionCode}:${me?.waitingForNextRound}`}
            lobby={lobby}
            participantId={currentUserId}
            isHost={isHost}
            disabled={disabled}
            onChange={change}
          />
        )}

        {lobby && lobby.state !== 'waiting' && reviewingWaiting && (
          <section className="card space-y-3">
            <h2 className="font-bold">Include everyone in a fresh round</h2>
            <p className="text-sm text-muted">
              {pendingPeople.map((p) => p.displayName).join(', ')} is waiting. Returning everyone to
              choices discards this round’s selections and Match. Everyone confirms Ready before a
              fresh deck is dealt.
            </p>
            <button
              className="btn btn-primary min-h-[48px] w-full"
              disabled={disabled}
              onClick={() => {
                if (
                  window.confirm(
                    'Return everyone to choices? This round’s selections and Match will be discarded. Everyone must confirm Ready again.'
                  )
                )
                  void run(() => restartSession(lobby.sessionCode));
              }}
            >
              Return everyone to choices
            </button>
            <button
              className="btn btn-secondary min-h-[48px] w-full"
              onClick={() =>
                navigate(
                  `/session/${sessionCode}/${sessionStatus === 'complete' ? 'results' : 'select'}`
                )
              }
            >
              Keep this round
            </button>
          </section>
        )}
        {sessionStatus === 'waiting' && !lobby?.starting && (
          <div className="mt-3 text-center">
            <SocialMoment
              moment="gather"
              seats={participants.map((participant) => ({
                ready: participant.ready,
                offline: participant.isOnline === false,
              }))}
            />
            <p className="mt-2 text-sm font-medium">Getting together.</p>
            <p className="mt-1 text-xs text-muted">Choose with whoever’s here.</p>
          </div>
        )}
        {lobby?.branch === 'watch' && <TmdbCredit />}
      </div>
    </main>
  );
}
