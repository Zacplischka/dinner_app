import type { AuthenticatedUser } from '../middleware/auth.js';

export interface SocketData {
  user?: AuthenticatedUser;
}

type SocketWithData = {
  data: SocketData;
};

export function setSocketUser(socket: SocketWithData, user: AuthenticatedUser): void {
  socket.data.user = user;
}

export function getSocketUser(socket: SocketWithData): AuthenticatedUser | undefined {
  return socket.data.user;
}

export function getSocketAuthToken(auth: unknown): string | undefined {
  if (!auth || typeof auth !== 'object' || !('token' in auth)) {
    return undefined;
  }

  const token = (auth as Record<'token', unknown>).token;
  return typeof token === 'string' ? token : undefined;
}
