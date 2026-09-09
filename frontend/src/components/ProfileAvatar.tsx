import { useState } from 'react';
import { API_BASE_URL } from '../services/apiClient';

/** One fixed-size fallback and crop for Profile, social and Session displays. */
export default function ProfileAvatar({
  name,
  url,
  label = name,
  className = '',
}: {
  name: string;
  url?: string | null;
  label?: string;
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string>();
  // Relative app photos belong to the API origin, including split-host web and Capacitor.
  const src = url?.startsWith('/api/profile-photos/')
    ? new URL(url, new URL(API_BASE_URL, window.location.origin)).href
    : url?.startsWith('https://')
      ? url
      : undefined;
  return (
    <span
      role="img"
      aria-label={label}
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-raised font-bold ${className}`}
    >
      {src && failedUrl !== src ? (
        <img
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
          onError={() => setFailedUrl(src)}
        />
      ) : (
        name.charAt(0).toUpperCase()
      )}
    </span>
  );
}
