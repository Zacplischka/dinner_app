// Public transport error vocabulary (ADR 0006). Every JSON REST failure and
// SSE error event is { code, message }: clients branch on the stable code.
// The backend's private DomainErrorCode maps onto this smaller vocabulary in
// one transport mapping (#104); persistence details never appear here.

export const API_ERROR_CODES = [
  // Session domain
  'SESSION_NOT_FOUND',
  'SESSION_FULL',
  'DISPLAY_NAME_TAKEN',
  'SESSION_ALREADY_STARTED',
  'NO_RESTAURANTS_FOUND',
  'VALIDATION_ERROR',
  'ALREADY_SUBMITTED',
  'NOT_IN_SESSION',
  // Friends domain
  'NOT_FOUND',
  'ALREADY_FRIENDS',
  'REQUEST_PENDING',
  // Auth middleware
  'MISSING_TOKEN',
  'TOKEN_EXPIRED',
  'INVALID_TOKEN',
  // Location / restaurant loading and comparison (spend-limited operations)
  'AREA_NOT_FOUND',
  'RATE_LIMITED',
  'NO_RESTAURANTS',
  'COMPARISON_FAILED',
  // Fallbacks
  'INTERNAL_ERROR',
  'UNKNOWN',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiError {
  code: ApiErrorCode;
  message: string;
}

const API_ERROR_CODE_SET = new Set<string>(API_ERROR_CODES);

export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'code' in value &&
    typeof value.code === 'string' &&
    API_ERROR_CODE_SET.has(value.code) &&
    'message' in value &&
    typeof value.message === 'string'
  );
}
