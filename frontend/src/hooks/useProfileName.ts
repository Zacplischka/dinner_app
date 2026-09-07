// Auth may settle after the page mounts. Untouched names follow that result;
// a corrected name always wins, including when the correction is empty.
import { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { validateDisplayName } from '../utils/displayName';

export function useProfileName(): [
  string,
  (name: string) => void,
  { isLoading: boolean; hasProfileName: boolean },
] {
  const user = useAuthStore((state) => state.user);
  const isLoading = useAuthStore((state) => state.isLoading);
  const [enteredName, setEnteredName] = useState<string>();
  const fullName = (user?.user_metadata as { full_name?: unknown } | undefined)?.full_name;
  const profileName = typeof fullName === 'string' ? fullName.trim() : '';
  const hasProfileName = !!user && validateDisplayName(profileName) === null;
  // An invalid Profile must be corrected explicitly, never silently truncated.
  return [
    enteredName ?? (hasProfileName ? profileName : ''),
    setEnteredName,
    { isLoading, hasProfileName: hasProfileName && enteredName === undefined },
  ];
}
