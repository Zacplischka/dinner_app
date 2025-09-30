import { Server as SocketIOServer } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@dinner-app/shared/types';
declare const app: import("express-serve-static-core").Express;
declare const httpServer: import("http").Server<typeof import("http").IncomingMessage, typeof import("http").ServerResponse>;
declare const io: SocketIOServer<ClientToServerEvents, ServerToClientEvents, import("socket.io").DefaultEventsMap, any>;
export { app, io, httpServer };
//# sourceMappingURL=server.d.ts.map