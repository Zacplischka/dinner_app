// #304: sessionStorage, not localStorage — the token is this tab's identity.
// Origin-wide it let a second tab rejoin as the first.
const rejoinKey = (code: string, name: string) => `dinder:rejoin:${code}:${name}`;

// Promises, so blocked storage rejects inside admission's awaited steps
// rather than throwing past them.
export const getRejoinToken = (code: string, name: string) =>
  new Promise<string | null>((resolve) => resolve(sessionStorage.getItem(rejoinKey(code, name))));
export const saveRejoinToken = (code: string, name: string, token: string) =>
  new Promise<void>((resolve) => resolve(sessionStorage.setItem(rejoinKey(code, name), token)));
export const clearRejoinToken = (code: string, name: string) =>
  new Promise<void>((resolve) => resolve(sessionStorage.removeItem(rejoinKey(code, name))));
