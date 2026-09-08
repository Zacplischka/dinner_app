import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin';
import type { StateStorage } from 'zustand/middleware';
import { toast } from '../hooks/useToast';

const missing = (error: unknown) =>
  error instanceof Error && error.message === 'Item with given key does not exist';

// Only the native branch uses the plugin: its web fallback is not encrypted.
export const credentialStorage = {
  async getItem(key) {
    if (!Capacitor.isNativePlatform()) return sessionStorage.getItem(key);
    try {
      return (await SecureStoragePlugin.get({ key })).value;
    } catch (error) {
      if (missing(error)) return null;
      throw error;
    }
  },
  async setItem(key, value) {
    if (!Capacitor.isNativePlatform()) return sessionStorage.setItem(key, value);
    await SecureStoragePlugin.set({ key, value });
  },
  async removeItem(key) {
    if (!Capacitor.isNativePlatform()) return sessionStorage.removeItem(key);
    try {
      await SecureStoragePlugin.remove({ key });
    } catch (error) {
      if (!missing(error)) throw error;
    }
  },
} satisfies StateStorage;

let activeRejoin: { key: string; token: string } | undefined;
let rejoinWrites = Promise.resolve();
const rejoinKey = (code: string, name: string) => `dinder:rejoin:${code}:${name}`;
export async function getRejoinToken(code: string, name: string): Promise<string | null> {
  const key = rejoinKey(code, name);
  if (!Capacitor.isNativePlatform()) return credentialStorage.getItem(key);
  if (activeRejoin?.key === key) return activeRejoin.token;
  const saved = await credentialStorage.getItem('heykeen.rejoin');
  if (!saved) return null;
  const value: unknown = JSON.parse(saved);
  if (
    !value ||
    typeof value !== 'object' ||
    !('key' in value) ||
    !('token' in value) ||
    value.key !== key ||
    typeof value.token !== 'string'
  )
    return null;
  return value.token;
}
export function saveRejoinToken(code: string, name: string, token: string): Promise<void> {
  const credential = { key: rejoinKey(code, name), token };
  if (!Capacitor.isNativePlatform()) return credentialStorage.setItem(credential.key, token);
  activeRejoin = credential;
  rejoinWrites = rejoinWrites
    .catch(() => undefined)
    .then(() =>
      credentialStorage.setItem(
        Capacitor.isNativePlatform() ? 'heykeen.rejoin' : credential.key,
        Capacitor.isNativePlatform() ? JSON.stringify(credential) : token
      )
    );
  return rejoinWrites;
}
export function clearRejoinToken(code: string, name: string): Promise<void> {
  const key = rejoinKey(code, name);
  if (!Capacitor.isNativePlatform()) return credentialStorage.removeItem(key);
  if (activeRejoin?.key === key) activeRejoin = undefined;
  rejoinWrites = rejoinWrites
    .catch(() => undefined)
    .then(async () => {
      if (!Capacitor.isNativePlatform()) return credentialStorage.removeItem(key);
      const saved = await credentialStorage.getItem('heykeen.rejoin');
      const value: unknown = saved ? JSON.parse(saved) : null;
      if (value && typeof value === 'object' && 'key' in value && value.key === key)
        await credentialStorage.removeItem('heykeen.rejoin');
    });
  return rejoinWrites;
}

// Serial writes keep an older swipe from overtaking Leave or Restart.
let pendingWrite = Promise.resolve();
export const nativeStateStorage: StateStorage = {
  async getItem(key) {
    return (await Preferences.get({ key })).value;
  },
  setItem(key, value) {
    pendingWrite = pendingWrite.catch(() => undefined).then(() => Preferences.set({ key, value }));
    return pendingWrite.catch(() => {
      toast.warning('Changes could not be saved on this phone. Keep YupCrew open.');
    });
  },
  removeItem(key) {
    pendingWrite = pendingWrite.catch(() => undefined).then(() => Preferences.remove({ key }));
    return pendingWrite.catch(() => {
      toast.warning('Saved data could not be cleared on this phone.');
    });
  },
};

export async function initializeNativeStorage(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  // iOS Keychain can outlive uninstall. A new installation must not silently
  // recover an old Profile or Participant. Do this before auth is imported.
  if (!(await Preferences.get({ key: 'heykeen.installed' })).value) {
    await SecureStoragePlugin.clear();
    await Preferences.set({ key: 'heykeen.installed', value: '1' });
  }
}
