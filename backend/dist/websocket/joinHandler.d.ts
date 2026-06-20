import type { Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, SessionJoinPayload, SessionJoinResponse } from '@dinder/shared/types';
export declare function handleSessionJoin(socket: Socket<ClientToServerEvents, ServerToClientEvents>, payload: SessionJoinPayload, callback: (response: SessionJoinResponse) => void): Promise<void>;
//# sourceMappingURL=joinHandler.d.ts.map