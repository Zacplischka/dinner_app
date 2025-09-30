import type { Socket, Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@dinner-app/shared/types';
export declare function handleDisconnect(socket: Socket<ClientToServerEvents, ServerToClientEvents>, _io: Server<ClientToServerEvents, ServerToClientEvents>, reason: string): Promise<void>;
//# sourceMappingURL=disconnectHandler.d.ts.map