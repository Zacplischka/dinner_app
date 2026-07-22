// The single private→public error transport mapping (issue #104).
// Every private DomainErrorCode maps to exactly one public ApiErrorCode + HTTP
// status. The wire body is always exactly { code, message } — persistence
// details never reach the client. This is the only place the mapping lives;
// both the global errorHandler and any router catch route through it.

import type { ApiError, ApiErrorCode } from '@dinder/shared/types';
import { DomainError, type DomainErrorCode } from '../services/DomainError.js';

const GENERIC_INTERNAL_MESSAGE = 'An unexpected error occurred. Please try again later.';

// `message` is set only where the domain message must not reach the client
// verbatim (it would leak persistence details, or reveal what the code conceals).
type Mapping = { code: ApiErrorCode; status: number; message?: string };

// Keyed by DomainErrorCode so the compiler forces this table to stay complete.
const MAPPING: Record<DomainErrorCode, Mapping> = {
  SESSION_NOT_FOUND: { code: 'SESSION_NOT_FOUND', status: 404 },
  SESSION_FULL: { code: 'SESSION_FULL', status: 409 },
  DISPLAY_NAME_TAKEN: { code: 'DISPLAY_NAME_TAKEN', status: 409 },
  SESSION_ALREADY_STARTED: { code: 'SESSION_ALREADY_STARTED', status: 409 },
  NO_RESTAURANTS_FOUND: { code: 'NO_RESTAURANTS_FOUND', status: 404 },
  VALIDATION_ERROR: { code: 'VALIDATION_ERROR', status: 400 },
  ALREADY_SUBMITTED: { code: 'ALREADY_SUBMITTED', status: 409 },
  INVALID_RESTAURANTS: { code: 'VALIDATION_ERROR', status: 400 },
  NOT_IN_SESSION: { code: 'NOT_IN_SESSION', status: 403 },
  // Upstream Places quota exhaustion: nothing the client can do, so 503.
  RATE_LIMITED: { code: 'RATE_LIMITED', status: 503 },
  not_found: { code: 'NOT_FOUND', status: 404 },
  already_friends: { code: 'ALREADY_FRIENDS', status: 409 },
  request_pending: { code: 'REQUEST_PENDING', status: 409 },
  // A block is intentionally not revealed to the blocked user: it maps to the
  // same status AND message as the missing-user path, or the message would leak
  // what the NOT_FOUND code conceals.
  blocked: { code: 'NOT_FOUND', status: 404, message: 'User not found with that email' },
  // Persistence failures never expose their internal message.
  database_error: { code: 'INTERNAL_ERROR', status: 500, message: GENERIC_INTERNAL_MESSAGE },
  validation_error: { code: 'VALIDATION_ERROR', status: 400 },
};

/**
 * Map any thrown error to its public { status, body } response. DomainErrors go
 * through the table above; malformed JSON bodies become VALIDATION_ERROR; every
 * other (unexpected) error becomes a detail-free INTERNAL_ERROR 500.
 */
export function toApiError(err: unknown): { status: number; body: ApiError } {
  if (err instanceof DomainError) {
    const mapped = MAPPING[err.code];
    // Unknown code (cast past the type) is treated as unexpected, not leaked.
    if (mapped) {
      return {
        status: mapped.status,
        body: { code: mapped.code, message: mapped.message ?? err.message },
      };
    }
  }

  // express.json() throws a SyntaxError with status 400 for malformed bodies.
  if (
    err instanceof SyntaxError &&
    'status' in err &&
    (err as { status?: number }).status === 400
  ) {
    return {
      status: 400,
      body: { code: 'VALIDATION_ERROR', message: 'Request body is not valid JSON' },
    };
  }

  return { status: 500, body: { code: 'INTERNAL_ERROR', message: GENERIC_INTERNAL_MESSAGE } };
}
