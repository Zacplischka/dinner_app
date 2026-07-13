import type { ComparisonStreamEvent } from '@dinder/shared/types';
import { API_BASE_URL } from './apiClient';

const eventTypes: ComparisonStreamEvent['type'][] = [
  'venue',
  'storefront',
  'comparison',
  'error',
];

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
  handlers: ComparisonStreamHandlers
) {
  const source = new EventSource(
    `${API_BASE_URL}/comparison/${encodeURIComponent(placeId)}/stream`
  );

  eventTypes.forEach((type) => {
    source.addEventListener(type, (event) => {
      if (!(event instanceof MessageEvent)) return;

      dispatch({ type, ...JSON.parse(event.data) } as ComparisonStreamEvent, handlers);
      if (type === 'comparison' || type === 'error') source.close();
    });
  });

  return () => source.close();
}
