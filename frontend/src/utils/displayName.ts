import { MAX_DISPLAY_NAME_LENGTH } from '@dinder/shared/types';

// The one display-name rule for a Host or Participant (#346). Every page that
// collects a name (Create, Join, Cook and Watch setup) sends `name.trim()` on the wire,
// so the bound is on the trimmed length.
export function validateDisplayName(name: string): string | null {
  const length = name.trim().length;
  return length < 1 || length > MAX_DISPLAY_NAME_LENGTH
    ? `Name must be between 1 and ${MAX_DISPLAY_NAME_LENGTH} characters`
    : null;
}
