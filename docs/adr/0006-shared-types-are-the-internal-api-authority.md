# Shared Types Are the Internal API Authority

Dinder supports its React TypeScript frontend as its only API consumer, so shared TypeScript transport types are the frontend-backend contract authority. `@dinder/shared` contains only wire DTOs, events, and stable cross-boundary values; persistence shapes, application state, backend-only models, and route builders remain local. OpenAPI or generated clients wait until an independent or non-TypeScript consumer exists.

This records the target contract for the contract-hardening work; current endpoints and events may not conform until that work lands.

## Consequences

- The backend runtime-validates untrusted inputs, type-checks responses, and proves wire shapes with focused contract tests; the frontend does not validate successful backend responses again.
- Each boundary maps DTOs into its own local models.
- REST failures are exactly `{ code: ApiErrorCode; message: string }`, with stable `SCREAMING_SNAKE_CASE` codes. Backend-only `DomainErrorCode` values map onto that smaller public vocabulary; clients display messages but branch only on public codes.
- Socket.IO commands acknowledge with `Ack<T>`, either `{ success: true; data: T }` or `{ success: false; error: ApiError }`, so success and failure fields cannot coexist.
- Server-sent comparison updates remain named events in a shared discriminated union, with `ApiError` as the `error` payload rather than a command acknowledgement wrapper.
- A public operation is complete when its provider type-checks against the shared response, malformed input has a validator test, and one transport test proves its successful and canonical failure wire shapes.
