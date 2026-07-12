// Typed domain error thrown by services and stores.
// The router owns the mapping from `code` to HTTP status and error body.
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
