// Typed domain error thrown by services and stores.
// The router owns the mapping from `code` to HTTP status and error body.

// Every code a service may throw. Session codes are SCREAMING_CASE,
// friends codes are snake_case (matches the persisted API contract).
export type DomainErrorCode =
  // Session domain
  | 'SESSION_NOT_FOUND'
  | 'SESSION_FULL'
  | 'DISPLAY_NAME_TAKEN'
  | 'SESSION_ALREADY_STARTED'
  | 'NO_RESTAURANTS_FOUND'
  | 'VALIDATION_ERROR'
  | 'ALREADY_SUBMITTED'
  | 'INVALID_RESTAURANTS'
  | 'NOT_IN_SESSION'
  // Friends domain
  | 'not_found'
  | 'already_friends'
  | 'blocked'
  | 'request_pending'
  | 'database_error'
  | 'validation_error';

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
