import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const serviceMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

const socketMocks = vi.hoisted(() => ({
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

describe('JoinSessionPage expired-link probe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the expired-link card when the probe 404s, and restores the form on demand', async () => {
    serviceMocks.getSession.mockRejectedValue(
      new ApiClientError('SESSION_NOT_FOUND', 'Session not found', 404)
    );
    renderPage('/join?code=AB123');

    expect(await screen.findByText('This link has expired')).toBeTruthy();
    expect(screen.queryByLabelText('Session Code')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Enter a code instead' }));

    expect((screen.getByLabelText('Session Code') as HTMLInputElement).value).toBe('AB123');
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

    expect((await screen.findByLabelText('Session Code')) as HTMLInputElement).toBeTruthy();
    expect((screen.getByLabelText('Session Code') as HTMLInputElement).value).toBe('AB123');
    expect(screen.queryByText('This link has expired')).toBeNull();
  });

  it('fails open on a non-404 error, leaving the form on screen', async () => {
    serviceMocks.getSession.mockRejectedValue(new Error('network'));
    renderPage('/join?code=AB123');

    expect((await screen.findByLabelText('Session Code')) as HTMLInputElement).toBeTruthy();
    expect(screen.queryByText('This link has expired')).toBeNull();
  });

  it('does not call getSession when the route has no code param', () => {
    renderPage('/join');

    expect(serviceMocks.getSession).not.toHaveBeenCalled();
  });
});

// #284: a Session already selecting admits late joiners — the ack's state
// decides whether they land in the lobby or straight on the Deck.
describe('JoinSessionPage late-join landing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const fillAndSubmit = () => {
    fireEvent.change(screen.getByLabelText('Session Code'), { target: { value: 'AB123' } });
    fireEvent.change(screen.getByLabelText('Your Name'), { target: { value: 'Bob' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join Session' }));
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
});
