import type { Socket, Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, SessionLeavePayload, SessionLeaveResponse } from '@dinder/shared/types';
export declare function handleSessionLeave(socket: Socket<ClientToServerEvents, ServerToClientEvents>, _io: Server<ClientToServerEvents, ServerToClientEvents>, payload: SessionLeavePayload, callback: (response: SessionLeaveResponse) => void): Promise<void>;
//# sourceMappingURL=leaveHandler.d.ts.map