// A signed-in person shouldn't retype the name their Profile already carries
// every time they open or join a Session (#412). This is the one name-field
// seam for the four pages that collect one — Create, Join, Cook and Watch setup.
//
// Auth resolves after first paint, so the seed is an effect, not an initial
// value. It fires only while the field is untouched: whatever the person types
// — including clearing it — wins for the rest of the page's life. A guest has
// no Profile and simply gets an empty box (ADR 0003).

import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';

/** `[name, setName]`, seeded once from the signed-in Profile's display name. */
export function useProfileName(): [string, (name: string) => void] {
  const user = useAuthStore((state) => state.user);
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);

  const fullName = (user?.user_metadata as { full_name?: unknown } | undefined)?.full_name;
  // The field is bounded at 50 characters (validateDisplayName); a longer
  // Profile name is trimmed to fit rather than seeding an unsubmittable form.
  const profileName = typeof fullName === 'string' ? fullName.trim().slice(0, 50) : '';

  useEffect(() => {
    if (!touched && profileName) setName(profileName);
  }, [touched, profileName]);

  return [
    name,
    (next: string) => {
      setTouched(true);
      setName(next);
    },
  ];
}
