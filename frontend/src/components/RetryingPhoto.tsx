// The one photo <img> for all three photo surfaces (#90): the Match card hero,
// the Comparison view Storefront hero, and the Compare page venue photo.
//
// A failed load is usually a transient photo-proxy 429/500, so: hide the image
// immediately (a broken slot is never visible — #75's "real photo or no hero"
// must hold at every instant), retry the same URL once after a short delay on a
// fresh node kept hidden until it actually loads, and give up for good on a
// second failure. While hidden this renders nothing (or a display:none retry
// node), so each caller's own layout handles the absence — no placeholder here.
//
// A change of URL is a fresh start: failure state must not carry over, because
// the Comparison view swaps its hero URL as Storefront captures stream in. The
// outer component remounts the attempt state per URL so callers need no `key`.
import { useEffect, useRef, useState, type ComponentPropsWithoutRef } from 'react';

export const PHOTO_RETRY_DELAY_MS = 2000;

type RetryingPhotoProps = { url: string } & Omit<
  ComponentPropsWithoutRef<'img'>,
  'src' | 'hidden' | 'onError' | 'onLoad'
>;

type Phase = 'first' | 'waiting' | 'retrying' | 'settled' | 'failed';

function PhotoAttempt({ url, alt = '', ...imgProps }: RetryingPhotoProps) {
  const [phase, setPhase] = useState<Phase>('first');
  const retryTimer = useRef<ReturnType<typeof setTimeout>>();

  // Clearing the timer on unmount also guarantees no setState after unmount.
  useEffect(() => () => clearTimeout(retryTimer.current), []);

  if (phase === 'waiting' || phase === 'failed') return null;

  return (
    <img
      // A fresh node per attempt, so the browser re-requests the URL.
      key={phase === 'first' ? 0 : 1}
      src={url}
      alt={alt}
      // ponytail: `hidden` still fetches in every engine we target; swap to an
      // offscreen Image() probe only if some engine stops loading hidden imgs.
      hidden={phase === 'retrying'}
      onLoad={phase === 'retrying' ? () => setPhase('settled') : undefined}
      onError={() => {
        if (phase === 'first') {
          retryTimer.current = setTimeout(() => setPhase('retrying'), PHOTO_RETRY_DELAY_MS);
          setPhase('waiting');
        } else {
          setPhase('failed');
        }
      }}
      {...imgProps}
    />
  );
}

export default function RetryingPhoto(props: RetryingPhotoProps) {
  return <PhotoAttempt key={props.url} {...props} />;
}
