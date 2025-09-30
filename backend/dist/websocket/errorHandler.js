export function emitError(socket, code, message, details) {
    const errorEvent = {
        code,
        message,
        details,
    };
    socket.emit('error', errorEvent);
    console.error(`[Error ${socket.id}] ${code}: ${message}`);
}
export const ErrorCodes = {
    SESSION_FULL: 'SESSION_FULL',
    SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    ALREADY_SUBMITTED: 'ALREADY_SUBMITTED',
    INVALID_OPTIONS: 'INVALID_OPTIONS',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    NOT_IN_SESSION: 'NOT_IN_SESSION',
};
//# sourceMappingURL=errorHandler.js.map