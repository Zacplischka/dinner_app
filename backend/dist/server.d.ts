import { Server as SocketIOServer } from 'socket.io';
import { type SocketData } from './websocket/socketAuth.js';
import type { ClientToServerEvents, ServerToClientEvents } from '@dinder/shared/types';
declare const app: import("express-serve-static-core").Express;
declare const httpServer: import("http").Server<typeof import("http").IncomingMessage, typeof import("http").ServerResponse>;
declare const io: SocketIOServer<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
export { app, io, httpServer };
//# sourceMappingURL=server.d.ts.map