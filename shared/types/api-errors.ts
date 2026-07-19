// Public REST error vocabulary (ADR 0006). Every JSON REST failure is exactly
// { code, message }: clients branch on the stable code, message is display text.
// The backend's private DomainErrorCode maps onto this smaller vocabulary in
// one transport mapping (#104); persistence details never appear here.

export type ApiErrorCode =
  // Session domain
  | 'SESSION_NOT_FOUND'
  | 'SESSION_FULL'
  | 'NO_RESTAURANTS_FOUND'
  | 'VALIDATION_ERROR'
  | 'ALREADY_SUBMITTED'
  | 'NOT_IN_SESSION'
  // Location / restaurant loading
  | 'AREA_NOT_FOUND'
  | 'NO_RESTAURANTS'
  | 'RATE_LIMITED'
  // Friends domain
  | 'NOT_FOUND'
  | 'ALREADY_FRIENDS'
  | 'REQUEST_PENDING'
  // Auth middleware
  | 'MISSING_TOKEN'
  | 'TOKEN_EXPIRED'
  | 'INVALID_TOKEN'
  // Fallbacks
  | 'INTERNAL_ERROR'
  | 'UNKNOWN';

export interface ApiError {
  code: ApiErrorCode;
  message: string;
}
