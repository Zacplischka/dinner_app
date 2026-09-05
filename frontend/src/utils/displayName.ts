// The one display-name rule for a Host or Participant (#346). Every page that
// collects a name (Create, Join, Cook setup) sends `name.trim()` on the wire,
// so the 1-50 bound is on the trimmed length.
export function validateDisplayName(name: string): string | null {
  const length = name.trim().length;
  return length < 1 || length > 50 ? 'Name must be between 1 and 50 characters' : null;
}
