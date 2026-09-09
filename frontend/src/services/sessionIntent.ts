// Shared by admission callers before their first asynchronous step.
export let sessionIntent = 0;
export let intendedParticipant: string | undefined;
export function beginSessionIntent(code?: string, name?: string): number {
  intendedParticipant = code && name ? `${code}:${name}` : undefined;
  return ++sessionIntent;
}
export const isSessionIntentCurrent = (intent: number): boolean => intent === sessionIntent;
