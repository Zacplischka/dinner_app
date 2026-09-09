import type { Ack } from '@dinder/shared/types';
import { toApiError } from '../api/toApiError.js';
import { logger } from '../logger.js';

/** A network callback is untrusted; reject before invoking any domain action. */
export function command<P, T>(
  handler: (payload: P, acknowledge: (response: Ack<T>) => void) => Promise<void>
): (payload: P, callback: (response: Ack<T>) => void) => void {
  return (payload, callback) => {
    if (typeof callback !== 'function') return;
    let acknowledged = false;
    const acknowledge = (response: Ack<T>) => {
      if (acknowledged) return;
      acknowledged = true;
      callback(response);
    };
    void (async () => {
      try {
        await handler(payload, acknowledge);
      } catch (error) {
        logger.error({ err: error }, 'Socket command failed');
        acknowledge({ success: false, error: toApiError(error).body });
      }
    })().catch((error: unknown) => {
      // Includes a failure while sending the error acknowledgement itself.
      logger.error({ err: error }, 'Socket acknowledgement failed');
    });
  };
}
