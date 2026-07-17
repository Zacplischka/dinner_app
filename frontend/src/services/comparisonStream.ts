import type { ComparisonStreamEvent, ComparisonTapSource } from '@dinder/shared/types';
import { API_BASE_URL } from './apiClient';

const eventTypes: ComparisonStreamEvent['type'][] = ['venue', 'storefront', 'comparison', 'error'];

export interface ComparisonStreamHandlers {
  onVenue?: (event: Extract<ComparisonStreamEvent, { type: 'venue' }>) => void;
  onStorefront?: (event: Extract<ComparisonStreamEvent, { type: 'storefront' }>) => void;
  onComparison?: (event: Extract<ComparisonStreamEvent, { type: 'comparison' }>) => void;
  onError?: (event: Extract<ComparisonStreamEvent, { type: 'error' }>) => void;
}

function dispatch(event: ComparisonStreamEvent, handlers: ComparisonStreamHandlers) {
  if (event.type === 'venue') handlers.onVenue?.(event);
  if (event.type === 'storefront') handlers.onStorefront?.(event);
  if (event.type === 'comparison') handlers.onComparison?.(event);
  if (event.type === 'error') handlers.onError?.(event);
}

export function subscribeToComparison(
  placeId: string,
  handlers: ComparisonStreamHandlers,
  source?: ComparisonTapSource
) {
  const stream = new EventSource(
    `${API_BASE_URL}/comparison/${encodeURIComponent(placeId)}/stream${
      source ? `?source=${source}` : ''
    }`
  );

  eventTypes.forEach((type) => {
    stream.addEventListener(type, (event) => {
      if (!(event instanceof MessageEvent)) {
        // A closed connection (e.g. the hourly-limit 429, whose body EventSource
        // cannot read) is terminal; transient drops reconnect automatically.
        if (type === 'error' && stream.readyState === EventSource.CLOSED) {
          stream.close();
          dispatch(
            {
              type: 'error',
              code: 'STREAM_CLOSED',
              message:
                'This comparison is unavailable right now — you may have reached the hourly limit. Please try again later.',
            },
            handlers
          );
        }
        return;
      }

      dispatch({ type, ...JSON.parse(event.data) } as ComparisonStreamEvent, handlers);
      if (type === 'comparison' || type === 'error') stream.close();
    });
  });

  return () => stream.close();
}
