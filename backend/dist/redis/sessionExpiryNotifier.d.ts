import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@dinner-app/shared/types';
export declare function initializeSessionExpiryNotifier(io: Server<ClientToServerEvents, ServerToClientEvents>): Promise<void>;
export declare function disconnectSessionExpiryNotifier(): Promise<void>;
//# sourceMappingURL=sessionExpiryNotifier.d.ts.map