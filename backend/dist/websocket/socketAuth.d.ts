import type { Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@dinder/shared/types';
import type { AuthenticatedUser } from '../middleware/auth.js';
export interface SocketData {
    user?: AuthenticatedUser;
}
export type DinderSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type SocketWithData = {
    data: SocketData;
};
export declare function setSocketUser(socket: SocketWithData, user: AuthenticatedUser): void;
export declare function getSocketUser(socket: SocketWithData): AuthenticatedUser | undefined;
export declare function getSocketAuthToken(auth: unknown): string | undefined;
export {};
//# sourceMappingURL=socketAuth.d.ts.map