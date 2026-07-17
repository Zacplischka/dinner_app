import { afterEach, describe, expect, it, vi } from 'vitest';

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static readonly CLOSED = 2;

  readonly listeners = new Map<string, EventListener[]>();
  readonly close = vi.fn();
  readyState = 1;

  constructor(readonly url: string | URL) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener) {
    this.listeners.set(type, [...(this.listeners.get(type) || []), listener]);
  }

  emit(type: string, data: unknown) {
    const event = new MessageEvent(type, { data: JSON.stringify(data) });
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }

  drop() {
    this.listeners.get('error')?.forEach((listener) => listener(new Event('error')));
  }

  fatalClose() {
    this.readyState = FakeEventSource.CLOSED;
    this.drop();
  }
}

describe('subscribeToComparison', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    FakeEventSource.instances = [];
  });

  it('forwards named events and closes only after a terminal event or unsubscribe', async () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    const handlers = {
      onVenue: vi.fn(),
      onStorefront: vi.fn(),
      onComparison: vi.fn(),
      onError: vi.fn(),
    };
    const { subscribeToComparison } = await import('../../src/services/comparisonStream');

    const unsubscribe = subscribeToComparison('place/one', handlers);
    const source = FakeEventSource.instances[0];

    expect(String(source.url)).toBe('http://localhost:3001/api/comparison/place%2Fone/stream');

    source.emit('venue', { placeId: 'place/one', venueName: '11 Inch Pizza' });
    source.emit('storefront', {
      platform: 'ubereats',
      storefront: { status: 'resolved', deals: [], menu: [] },
    });
    source.drop();

    expect(handlers.onVenue).toHaveBeenCalledWith({
      type: 'venue',
      placeId: 'place/one',
      venueName: '11 Inch Pizza',
    });
    expect(handlers.onStorefront).toHaveBeenCalledWith({
      type: 'storefront',
      platform: 'ubereats',
      storefront: { status: 'resolved', deals: [], menu: [] },
    });
    expect(source.close).not.toHaveBeenCalled();

    source.emit('comparison', {
      comparison: {
        placeId: 'place/one',
        venueName: '11 Inch Pizza',
        fetchedAt: '2026-07-13T08:00:00.000Z',
        storefronts: {
          ubereats: { status: 'not_found', deals: [], menu: [] },
          doordash: { status: 'not_found', deals: [], menu: [] },
        },
        matchedItems: [],
        unmatched: { ubereats: [], doordash: [] },
      },
    });
    expect(source.close).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(source.close).toHaveBeenCalledTimes(2);
  });

  it('forwards a named error as terminal without treating a network drop as one', async () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    const handlers = {
      onError: vi.fn(),
    };
    const { subscribeToComparison } = await import('../../src/services/comparisonStream');

    subscribeToComparison('place-1', handlers);
    const source = FakeEventSource.instances[0];
    source.drop();
    source.emit('error', { code: 'RATE_LIMITED', message: 'Please try again shortly.' });

    expect(handlers.onError).toHaveBeenCalledOnce();
    expect(handlers.onError).toHaveBeenCalledWith({
      type: 'error',
      code: 'RATE_LIMITED',
      message: 'Please try again shortly.',
    });
    expect(source.close).toHaveBeenCalledOnce();
  });

  it('appends the tap source to the stream URL only when one is given', async () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    const { subscribeToComparison } = await import('../../src/services/comparisonStream');

    subscribeToComparison('place-1', {}, 'match_card');
    subscribeToComparison('place-1', {});

    expect(String(FakeEventSource.instances[0].url)).toBe(
      'http://localhost:3001/api/comparison/place-1/stream?source=match_card'
    );
    expect(String(FakeEventSource.instances[1].url)).toBe(
      'http://localhost:3001/api/comparison/place-1/stream'
    );
  });

  it('surfaces a fatal stream close (e.g. the hourly 429) as a terminal error', async () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    const handlers = { onError: vi.fn() };
    const { subscribeToComparison } = await import('../../src/services/comparisonStream');

    subscribeToComparison('place-1', handlers);
    const source = FakeEventSource.instances[0];
    source.fatalClose();

    expect(handlers.onError).toHaveBeenCalledOnce();
    expect(handlers.onError).toHaveBeenCalledWith({
      type: 'error',
      code: 'STREAM_CLOSED',
      message: expect.stringMatching(/hourly.*limit|try again/i),
    });
    expect(source.close).toHaveBeenCalled();
  });
});
