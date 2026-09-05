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
  // The Cook Branch's counterpart: a Craving whose pool holds no Recipes.
  | 'NO_RECIPES_FOUND'
  // The recipe source was asked and did not answer — distinct from the clean
  // miss above, because "remove a filter" is the wrong instruction when the
  // source was merely down (#250).
  | 'RECIPE_SOURCE_UNAVAILABLE'
  // A Session that exists but holds no usable restaurants, distinct from a
  // search that found none (NO_RESTAURANTS_FOUND).
  | 'NO_RESTAURANTS'
  | 'VALIDATION_ERROR'
  | 'ALREADY_SUBMITTED'
  | 'INVALID_RESTAURANTS'
  | 'NOT_IN_SESSION'
  // A Shopping List URL that names nothing: expired, or never minted. Its own
  // code because the list is its own resource on its own clock, not a Session.
  | 'SHOPPING_LIST_NOT_FOUND'
  // A Host-entered suburb/postcode the geocoder cannot place.
  | 'AREA_NOT_FOUND'
  | 'RATE_LIMITED'
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
