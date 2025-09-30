// REST API client for Dinner Decider
// Based on: specs/001-dinner-decider-enables/tasks.md T049

import type { DinnerOption } from '@dinner-app/shared/types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

interface CreateSessionResponse {
  sessionCode: string;
  hostName: string;
  participantCount: number;
  state: string;
  expiresAt: string;
  shareableLink: string;
}

interface SessionResponse {
  sessionCode: string;
  hostName: string;
  participantCount: number;
  state: string;
  expiresAt: string;
  shareableLink: string;
}

interface ErrorResponse {
  error: string;
  code: string;
  message: string;
  details?: any;
}

/**
 * Create a new session
 */
export async function createSession(hostName: string): Promise<CreateSessionResponse> {
  const response = await fetch(`${API_BASE_URL}/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ hostName }),
  });

  if (!response.ok) {
    const error: ErrorResponse = await response.json();
    throw new Error(error.message || 'Failed to create session');
  }

  return response.json();
}

/**
 * Get session details by code
 */
export async function getSession(sessionCode: string): Promise<SessionResponse> {
  const response = await fetch(`${API_BASE_URL}/sessions/${sessionCode}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error: ErrorResponse = await response.json();
    throw new Error(error.message || 'Failed to get session');
  }

  return response.json();
}

/**
 * Get list of dinner options
 */
export async function getDinnerOptions(): Promise<DinnerOption[]> {
  const response = await fetch(`${API_BASE_URL}/options`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch dinner options');
  }

  const data = await response.json();
  return data.options;
}

/**
 * Generic error handler for API calls
 */
export function handleApiError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
}