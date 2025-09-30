import type { Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@dinner-app/shared/types';
export declare function emitError(socket: Socket<ClientToServerEvents, ServerToClientEvents>, code: string, message: string, details?: Record<string, unknown>): void;
export declare const ErrorCodes: {
    readonly SESSION_FULL: "SESSION_FULL";
    readonly SESSION_NOT_FOUND: "SESSION_NOT_FOUND";
    readonly VALIDATION_ERROR: "VALIDATION_ERROR";
    readonly ALREADY_SUBMITTED: "ALREADY_SUBMITTED";
    readonly INVALID_OPTIONS: "INVALID_OPTIONS";
    readonly INTERNAL_ERROR: "INTERNAL_ERROR";
    readonly NOT_IN_SESSION: "NOT_IN_SESSION";
};
//# sourceMappingURL=errorHandler.d.ts.map