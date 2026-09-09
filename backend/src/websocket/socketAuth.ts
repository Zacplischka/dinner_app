import { verifyToken, type AuthenticatedUser } from '../middleware/auth.js';
import type { FriendsService } from '../services/FriendsService.js';

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

/** Photo lookup is cosmetic: bound the entire auth/Profile read so outages do not block admission. */
export async function resolveSessionAvatar(
  token: string | undefined,
  profiles: Pick<FriendsService, 'getCurrentProfile'>
): Promise<string | null> {
  if (!token) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const user = await verifyToken(token);
        return user ? (await profiles.getCurrentProfile(user.id, user.email)).avatarUrl : null;
      })(),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), 2000);
      }),
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
