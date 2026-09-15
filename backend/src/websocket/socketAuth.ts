import { verifyToken } from '../middleware/auth.js';
import type { FriendsService } from '../services/FriendsService.js';

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
