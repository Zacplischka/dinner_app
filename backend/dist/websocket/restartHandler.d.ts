import type { Socket, Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, SessionRestartPayload, SessionRestartResponse } from '@dinner-app/shared/types';
export declare function handleSessionRestart(socket: Socket<ClientToServerEvents, ServerToClientEvents>, io: Server<ClientToServerEvents, ServerToClientEvents>, payload: SessionRestartPayload, callback: (response: SessionRestartResponse) => void): Promise<void>;
//# sourceMappingURL=restartHandler.d.ts.map