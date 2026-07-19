import {
  COMPARISON_STREAM_EVENT_NAMES,
  parseComparisonStreamEvent,
  type ApiErrorCode,
  type ComparisonEntryRequest,
  type ComparisonStreamEvent,
  type ComparisonTapSource,
} from '@dinder/shared/types';
import { API_BASE_URL } from './apiClient';

export interface ComparisonStreamError {
  type: 'error';
  code: ApiErrorCode | 'STREAM_CLOSED';
  message: string;
}

export interface ComparisonStreamHandlers {
  onVenue?: (event: Extract<ComparisonStreamEvent, { type: 'venue' }>) => void;
  onStorefront?: (event: Extract<ComparisonStreamEvent, { type: 'storefront' }>) => void;
  onComparison?: (event: Extract<ComparisonStreamEvent, { type: 'comparison' }>) => void;
  onError?: (event: ComparisonStreamError) => void;
}

function dispatch(event: ComparisonStreamEvent, handlers: ComparisonStreamHandlers) {
  if (event.type === 'venue') handlers.onVenue?.(event);
  if (event.type === 'storefront') handlers.onStorefront?.(event);
  if (event.type === 'comparison') handlers.onComparison?.(event);
  if (event.type === 'error') handlers.onError?.(event);
}

function rejectMalformedEvent(stream: EventSource, handlers: ComparisonStreamHandlers) {
  stream.close();
  handlers.onError?.({
    type: 'error',
    code: 'UNKNOWN',
    message: 'The comparison stream returned an invalid update. Please try again.',
  });
}

export function subscribeToComparison(
  placeId: string,
  handlers: ComparisonStreamHandlers,
  source?: ComparisonTapSource
) {
  const input: ComparisonEntryRequest = source ? { placeId, source } : { placeId };
  const stream = new EventSource(
    `${API_BASE_URL}/comparison/${encodeURIComponent(input.placeId)}/stream${
      input.source ? `?source=${input.source}` : ''
    }`
  );

  COMPARISON_STREAM_EVENT_NAMES.forEach((type) => {
    stream.addEventListener(type, (event) => {
      if (!(event instanceof MessageEvent)) {
        // A closed connection (e.g. the hourly-limit 429, whose body EventSource
        // cannot read) is terminal; transient drops reconnect automatically.
        if (type === 'error' && stream.readyState === EventSource.CLOSED) {
          stream.close();
          handlers.onError?.({
            type: 'error',
            code: 'STREAM_CLOSED',
            message:
              'This comparison is unavailable right now — you may have reached the hourly limit. Please try again later.',
          });
        }
        return;
      }

      if (typeof event.data !== 'string') {
        rejectMalformedEvent(stream, handlers);
        return;
      }
      let data: unknown;
      try {
        data = JSON.parse(event.data);
      } catch {
        rejectMalformedEvent(stream, handlers);
        return;
      }
      const comparisonEvent = parseComparisonStreamEvent(type, data);
      if (!comparisonEvent) {
        rejectMalformedEvent(stream, handlers);
        return;
      }

      dispatch(comparisonEvent, handlers);
      if (comparisonEvent.type === 'comparison' || comparisonEvent.type === 'error') stream.close();
    });
  });

  return () => stream.close();
}
