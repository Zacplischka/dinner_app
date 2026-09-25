import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const serviceMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

const socketMocks = vi.hoisted(() => ({
  initializeSocket: vi.fn(),
  waitForConnection: vi.fn(async () => undefined),
  joinSession: vi.fn(),
}));

vi.mock('../../src/services/apiClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/services/apiClient')>()),
  getSession: serviceMocks.getSession,
}));

vi.mock('../../src/services/socketBindings', () => socketMocks);

import { ApiClientError } from '../../src/services/apiClient';
import JoinSessionPage from '../../src/pages/JoinSessionPage';
import { useSessionStore } from '../../src/stores/sessionStore';
import { useAuthStore } from '../../src/stores/authStore';

beforeEach(() => {
  useAuthStore.setState({ user: null, session: null, isAuthenticated: false, isLoading: false });
  useSessionStore.getState().resetSession();
});

function renderPage(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/join" element={<JoinSessionPage />} />
        <Route path="/create" element={<div>Create route</div>} />
        <Route path="/session/:sessionCode" element={<div>Lobby route</div>} />
        <Route path="/session/:sessionCode/select" element={<div>Deck route</div>} />
      </Routes>
    </MemoryRouter>
  );
}

// #412: one case rule across the funnel — "session" is a plain noun on screen,
// so the header and the button under it can't disagree about it.
describe('JoinSessionPage copy', () => {
  it('lowercases session in the header and the submit button alike', () => {
    renderPage('/join');

    expect(screen.getByRole('heading', { name: 'Join a session' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join session' })).toBeInTheDocument();
    expect(screen.queryByText(/Join Session/)).toBeNull();
  });
});

describe('JoinSessionPage dead-link probe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // #545: a 404 can't tell an ended Session from a mistyped code, so it says neither is "expired".
  it('shows the not-found card when the probe 404s, and restores the form on demand', async () => {
    serviceMocks.getSession.mockRejectedValue(
      new ApiClientError('SESSION_NOT_FOUND', 'Session not found', 404)
    );
    renderPage('/join?code=AB123');

    expect(
      await screen.findByRole('heading', { name: 'We couldn’t find that session' })
    ).toBeTruthy();
    expect(screen.getByText(/over — or the code was mistyped/)).toBeTruthy();
    expect(screen.queryByText(/expired/i)).toBeNull();
    expect(screen.queryByLabelText('Session code')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Enter a code instead' }));

    expect((screen.getByLabelText('Session code') as HTMLInputElement).value).toBe('AB123');
  });

  it('keeps the prefilled form when the probe resolves a live session', async () => {
    serviceMocks.getSession.mockResolvedValue({
      sessionCode: 'AB123',
      hostName: 'Alice',
      participantCount: 1,
      state: 'waiting',
      expiresAt: new Date().toISOString(),
      shareableLink: 'http://localhost:3000/join?code=AB123',
    });
    renderPage('/join?code=AB123');

    expect((await screen.findByLabelText('Session code')) as HTMLInputElement).toBeTruthy();
    expect((screen.getByLabelText('Session code') as HTMLInputElement).value).toBe('AB123');
    expect(screen.queryByText('We couldn’t find that session')).toBeNull();
  });

  it('fails open on a non-404 error, leaving the form on screen', async () => {
    serviceMocks.getSession.mockRejectedValue(new Error('network'));
    renderPage('/join?code=AB123');

    expect((await screen.findByLabelText('Session code')) as HTMLInputElement).toBeTruthy();
    expect(screen.queryByText('We couldn’t find that session')).toBeNull();
  });

  it('does not call getSession when the route has no code param', () => {
    renderPage('/join');

    expect(serviceMocks.getSession).not.toHaveBeenCalled();
  });

  // #545: a wrong-length code used to be truncated to 5 and probed (then called expired).
  it.each(['ZZZZZZ', 'AB1'])(
    'flags the wrong-length code %s without looking it up or joining',
    async (code) => {
      useAuthStore.setState({
        user: { user_metadata: { full_name: 'Alice' } } as never,
        isAuthenticated: true,
      });
      serviceMocks.getSession.mockResolvedValue({});
      renderPage(`/join?code=${code}`);

      expect(
        await screen.findByText('That code doesn’t look right — codes are 5 characters')
      ).toBeTruthy();
      expect(serviceMocks.getSession).not.toHaveBeenCalled();
      expect(socketMocks.joinSession).not.toHaveBeenCalled();
    }
  );

  // Auto-join is for an accepted Invite Link, not for a code typed after a rejected one.
  it('waits for Join when a code is typed after a rejected URL code', async () => {
    useAuthStore.setState({
      user: { user_metadata: { full_name: 'Alice' } } as never,
      isAuthenticated: true,
    });
    socketMocks.joinSession.mockResolvedValue({
      success: true,
      data: { participantId: 'alice', state: 'waiting' },
    });
    renderPage('/join?code=ZZZZZZ');
    await screen.findByText('That code doesn’t look right — codes are 5 characters');

    fireEvent.change(screen.getByLabelText('Session code'), { target: { value: 'AB123' } });
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(socketMocks.joinSession).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Join session' }));
    expect(await screen.findByText('Lobby route')).toBeTruthy();
    expect(socketMocks.joinSession).toHaveBeenCalledWith(
      'AB123',
      'Alice',
      false,
      expect.any(Number)
    );
  });

  it('starts fresh when the URL code changes past the fifth character', async () => {
    serviceMocks.getSession.mockResolvedValue({});
    function Relink() {
      const navigate = useNavigate();
      return <button onClick={() => navigate('/join?code=AB123')}>Relink</button>;
    }
    render(
      <MemoryRouter initialEntries={['/join?code=AB123X']}>
        <Relink />
        <Routes>
          <Route path="/join" element={<JoinSessionPage />} />
        </Routes>
      </MemoryRouter>
    );
    await screen.findByText('That code doesn’t look right — codes are 5 characters');

    fireEvent.click(screen.getByText('Relink'));

    expect(await screen.findByLabelText('Session code')).toHaveValue('AB123');
    expect(screen.queryByText(/doesn’t look right/)).toBeNull();
  });
});

// #284: a Session already selecting admits late joiners — the ack's state
// decides whether they land in the lobby or straight on the Deck.
describe('JoinSessionPage late-join landing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const fillAndSubmit = () => {
    fireEvent.change(screen.getByLabelText('Session code'), { target: { value: 'AB123' } });
    fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'Bob' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join session' }));
  };

  it('lands a joiner on the Deck when the ack says the session is selecting', async () => {
    socketMocks.joinSession.mockResolvedValue({
      success: true,
      data: { participantId: 'p-bob', state: 'selecting' },
    });
    renderPage('/join');

    fillAndSubmit();

    expect(await screen.findByText('Deck route')).toBeTruthy();
  });

  it('lands a joiner in the lobby when the session has not started', async () => {
    socketMocks.joinSession.mockResolvedValue({
      success: true,
      data: { participantId: 'p-bob', state: 'waiting' },
    });
    renderPage('/join');

    fillAndSubmit();

    expect(await screen.findByText('Lobby route')).toBeTruthy();
  });

  it('surfaces the finished-session refusal verbatim', async () => {
    socketMocks.joinSession.mockResolvedValue({
      success: false,
      error: { code: 'SESSION_ALREADY_STARTED', message: 'This session has finished' },
    });
    renderPage('/join');

    fillAndSubmit();

    expect(await screen.findByText('This session has finished')).toBeTruthy();
  });

  // #545: a typed code that names no Session gets the same not-found hedge as a dead link.
  it('says a typed code was not found, not expired', async () => {
    socketMocks.joinSession.mockResolvedValue({
      success: false,
      error: { code: 'SESSION_NOT_FOUND', message: 'Session not found or has expired' },
    });
    renderPage('/join');

    fillAndSubmit();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We couldn’t find that session. It’s over — or the code was mistyped.'
    );
    expect(screen.queryByText(/expired/i)).toBeNull();
  });
});

// #412 — a signed-in joiner doesn't retype the name their Profile carries.
describe('JoinSessionPage identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: null, session: null, isAuthenticated: false, isLoading: false });
  });

  it('uses the signed-in name without displaying a name form', async () => {
    renderPage('/join');
    expect((screen.getByLabelText('Your Name') as HTMLInputElement).value).toBe('');

    act(() => {
      useAuthStore.setState({
        user: { user_metadata: { full_name: 'Alice Nguyen' } } as never,
        isAuthenticated: true,
      });
    });

    await waitFor(() => expect(screen.queryByLabelText('Your Name')).toBeNull());
  });

  it('leaves a guest with an empty name field', () => {
    renderPage('/join');
    expect((screen.getByLabelText('Your Name') as HTMLInputElement).value).toBe('');
  });
});

it('reveals a correction field on a collision while preserving the Invite Link', async () => {
  useAuthStore.setState({
    user: { user_metadata: { full_name: 'Alice' } } as never,
    isAuthenticated: true,
  });
  serviceMocks.getSession.mockResolvedValue({ state: 'waiting' });
  socketMocks.joinSession.mockResolvedValueOnce({
    success: false,
    error: { code: 'DISPLAY_NAME_TAKEN', message: 'That name is already taken. Choose another.' },
  });
  renderPage('/join?code=AB123');
  expect(await screen.findByRole('alert')).toHaveTextContent('already taken');
  expect(screen.getByLabelText('Session code')).toHaveValue('AB123');
  expect(screen.getByLabelText('Your Name')).toHaveValue('Alice');
  fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'Alice N' } });
  socketMocks.joinSession.mockResolvedValueOnce({
    success: true,
    data: { participantId: 'alice', state: 'waiting' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Join session' }));
  expect(await screen.findByText('Lobby route')).toBeTruthy();
  expect(socketMocks.joinSession).toHaveBeenLastCalledWith(
    'AB123',
    'Alice N',
    false,
    expect.any(Number)
  );
});
it('routes a pending Cook newcomer to choices during a selecting Session', async () => {
  socketMocks.joinSession.mockResolvedValueOnce({
    success: true,
    data: {
      participantId: 'p-bob',
      state: 'selecting',
      lobby: { participants: [{ participantId: 'p-bob', waitingForNextRound: true }] },
    },
  });
  renderPage('/join');
  fireEvent.change(screen.getByLabelText('Session code'), { target: { value: 'AB123' } });
  fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'Bob' } });
  fireEvent.click(screen.getByRole('button', { name: 'Join session' }));
  expect(await screen.findByText('Lobby route')).toBeTruthy();
});

function WarmLink() {
  const navigate = useNavigate();
  return <button onClick={() => navigate('/join?code=NEW12')}>Next invite</button>;
}
function renderWarmLink() {
  return render(
    <MemoryRouter initialEntries={['/join?code=OLD12']}>
      <WarmLink />
      <Routes>
        <Route path="/join" element={<JoinSessionPage />} />
        <Route path="/session/:code" element={<div>Joined destination</div>} />
      </Routes>
    </MemoryRouter>
  );
}
it('resets an expired warm invitation when another valid link arrives', async () => {
  serviceMocks.getSession
    .mockRejectedValueOnce(new ApiClientError('SESSION_NOT_FOUND', 'Expired', 404))
    .mockResolvedValue({});
  renderWarmLink();
  await screen.findByText('We couldn’t find that session');
  fireEvent.click(screen.getByText('Next invite'));
  expect(await screen.findByLabelText('Session code')).toHaveValue('NEW12');
  expect(screen.queryByText('We couldn’t find that session')).toBeNull();
});
it('ignores an old invitation probe after a newer warm link', async () => {
  let rejectOld!: (error: unknown) => void;
  serviceMocks.getSession
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectOld = reject;
        })
    )
    .mockResolvedValue({});
  renderWarmLink();
  fireEvent.click(screen.getByText('Next invite'));
  await act(async () => rejectOld(new ApiClientError('SESSION_NOT_FOUND', 'Expired', 404)));
  expect(screen.getByLabelText('Session code')).toHaveValue('NEW12');
  expect(screen.queryByText('We couldn’t find that session')).toBeNull();
});
it('retries autojoin by invitation identity and ignores the old completion', async () => {
  useAuthStore.setState({
    user: { id: 'profile', user_metadata: { full_name: 'Alice' } } as never,
    isAuthenticated: true,
    isLoading: false,
  });
  serviceMocks.getSession.mockResolvedValue({});
  let finishOld!: (ack: unknown) => void;
  socketMocks.joinSession
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        })
    )
    .mockResolvedValue({ success: false, error: { code: 'SESSION_FULL', message: 'full' } });
  renderWarmLink();
  await waitFor(() => expect(finishOld).toBeDefined());
  fireEvent.click(screen.getByText('Next invite'));
  await screen.findByText('This session is full (maximum 4 participants)');
  await act(async () =>
    finishOld({ success: true, data: { participantId: 'old', state: 'waiting' } })
  );
  expect(screen.getByLabelText('Session code')).toHaveValue('NEW12');
  expect(screen.queryByText('Joined destination')).toBeNull();
});

// #518: the socket handshake starts while the joiner is still typing, not on submit.
it('starts connecting on arrival without joining anything', async () => {
  vi.clearAllMocks();
  serviceMocks.getSession.mockResolvedValue({});
  renderPage('/join?code=AB123');
  await waitFor(() => expect(serviceMocks.getSession).toHaveBeenCalled());
  // Socket before the probe fetch: WebKit drops a handshake that follows one in the same tick.
  expect(socketMocks.initializeSocket.mock.invocationCallOrder[0]).toBeLessThan(
    serviceMocks.getSession.mock.invocationCallOrder[0]
  );
  expect(socketMocks.joinSession).not.toHaveBeenCalled();
});

// #510: admission replaces the Invite Link entry, so browser Back lands where
// the joiner came from instead of on /join?code=…, which would auto-join again.
function BrowserBack() {
  const navigate = useNavigate();
  return <button onClick={() => navigate(-1)}>Browser back</button>;
}
it('replaces the Join entry on admission, so Back does not rejoin', async () => {
  useAuthStore.setState({
    user: { id: 'profile', user_metadata: { full_name: 'Alice' } } as never,
    isAuthenticated: true,
    isLoading: false,
  });
  serviceMocks.getSession.mockResolvedValue({});
  socketMocks.joinSession.mockReset();
  socketMocks.joinSession.mockResolvedValue({
    success: true,
    data: { participantId: 'alice', state: 'waiting' },
  });
  render(
    <MemoryRouter initialEntries={['/', '/join?code=AB123']} initialIndex={1}>
      <Routes>
        <Route path="/" element={<div>Home route</div>} />
        <Route path="/join" element={<JoinSessionPage />} />
        <Route path="/session/:sessionCode" element={<BrowserBack />} />
      </Routes>
    </MemoryRouter>
  );
  fireEvent.click(await screen.findByText('Browser back'));
  expect(await screen.findByText('Home route')).toBeTruthy();
  expect(socketMocks.joinSession).toHaveBeenCalledTimes(1);
});
