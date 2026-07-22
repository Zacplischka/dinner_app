// OrderService — opens a Group Order for a completed Session (issue 2a).
// `open` turns the crowned Venue's cached Snapshot menu into a Pinned Menu
// living in Redis for the life of the Session. Factory + injected deps, so it
// opens no connection at import (compositionRoot.test.ts guards that).

import type {
  MenuItemCapture,
  OrderLine,
  OrderPlatform,
  OrderShare,
  OrderState,
  Snapshot,
} from '@dinder/shared/types';
import type { SessionStore } from '../store/sessionStore.js';
import { DomainError } from './DomainError.js';
import { deriveComparison } from './comparisonMatcher.js';
import { isFresh } from './ComparisonService.js';

export interface OrderServiceDeps {
  store: SessionStore;
  snapshotStore: { getLatest: (placeId: string) => Promise<Snapshot | null> };
  freshnessMs: number;
  failureFreshnessMs: number;
}

export type OrderUnavailable = { reason: 'stale' | 'no_menu'; message: string };

export interface OrderService {
  open(
    sessionCode: string,
    participantId: string,
    placeId: string
  ): Promise<OrderState | OrderUnavailable>;
  addItem(
    sessionCode: string,
    participantId: string,
    index: number,
    delta: 1 | -1
  ): Promise<{ order: OrderState; change: { by: string; name: string; delta: 1 | -1 } }>;
}

export function createOrderService(deps: OrderServiceDeps): OrderService {
  const { store, snapshotStore, freshnessMs, failureFreshnessMs } = deps;

  /**
   * Builds the wire state from the stored order hash and its Order Lines. The
   * Pinned Menu (`hash.menu`) resolves each Line's name/price; the raw menu is
   * attached because every caller here is the order:open ack (a broadcast strips it).
   */
  function toOrderState(hash: Record<string, string>, lines: Record<string, string>): OrderState {
    const menu = JSON.parse(hash.menu) as MenuItemCapture[];

    const orderLines: OrderLine[] = [];
    const itemsByName = new Map<string, number>();
    for (const [field, qtyRaw] of Object.entries(lines)) {
      // Split at the first colon only — a displayName may itself contain colons.
      const colon = field.indexOf(':');
      const index = parseInt(field.slice(0, colon), 10);
      const by = field.slice(colon + 1);
      const qty = parseInt(qtyRaw, 10);
      const item = menu[index];
      orderLines.push({ index, name: item.name, priceCents: item.price_cents, qty, by });
      itemsByName.set(by, (itemsByName.get(by) ?? 0) + item.price_cents * qty);
    }

    const itemsCents = orderLines.reduce((sum, line) => sum + line.priceCents * line.qty, 0);
    const feeCents = parseInt(hash.feeCents, 10);

    // Even split of the Buyer's fee across everyone with a Line, remainder one
    // cent at a time in ascending displayName order → shares always sum to
    // items + fee (§ Hard cases). feeCents is 0 until #179 can set it.
    const names = [...itemsByName.keys()].sort();
    const base = names.length ? Math.floor(feeCents / names.length) : 0;
    const remainder = names.length ? feeCents - base * names.length : 0;
    const shares: OrderShare[] = names.map((displayName, i) => {
      const personItems = itemsByName.get(displayName) ?? 0;
      const fee = base + (i < remainder ? 1 : 0);
      return { displayName, itemsCents: personItems, feeCents: fee, totalCents: personItems + fee };
    });

    const state: OrderState = {
      sessionCode: hash.sessionCode ?? '',
      placeId: hash.placeId,
      venueName: hash.venueName,
      platform: hash.platform as OrderPlatform,
      pricesAt: hash.pricesAt,
      lines: orderLines,
      feeCents,
      itemsCents,
      totalCents: itemsCents + feeCents,
      shares,
      state: hash.state as OrderState['state'],
      menu,
    };
    if (hash.storeUrl) state.storeUrl = hash.storeUrl;
    if (hash.cheaperPercent) state.cheaperPercent = parseInt(hash.cheaperPercent, 10);
    if (hash.buyer) state.buyer = hash.buyer;
    return state;
  }

  async function open(
    sessionCode: string,
    participantId: string,
    placeId: string
  ): Promise<OrderState | OrderUnavailable> {
    if (!(await store.readSession(sessionCode))) {
      throw new DomainError('SESSION_NOT_FOUND', 'Session not found');
    }
    if (!(await store.isParticipant(sessionCode, participantId))) {
      throw new DomainError('NOT_IN_SESSION', 'You are not in this session');
    }
    if (!(await store.isResultPlaceId(sessionCode, placeId))) {
      throw new DomainError('VALIDATION_ERROR', 'That Venue was not this Session outcome');
    }

    // Rejoin / reload / late-join recovery: an open order is returned untouched,
    // even when its placeId differs from the requested one. No re-derive, no read.
    const existing = await store.readOrder(sessionCode);
    if (existing) {
      return toOrderState(existing, await store.readOrderLines(sessionCode));
    }

    const snapshot = await snapshotStore.getLatest(placeId);
    if (!snapshot || !isFresh(snapshot, freshnessMs, failureFreshnessMs)) {
      return { reason: 'stale', message: 'Prices for this Venue are stale. Please try again.' };
    }

    // `failed` is retryable (short freshness), not a permanent no-menu verdict.
    if (
      snapshot.payload.ubereats.status === 'failed' ||
      snapshot.payload.doordash.status === 'failed'
    ) {
      return { reason: 'stale', message: 'Prices for this Venue are stale. Please try again.' };
    }
    if (
      snapshot.payload.ubereats.status === 'not_found' &&
      snapshot.payload.doordash.status === 'not_found'
    ) {
      return { reason: 'no_menu', message: 'This Venue has no menu to order from.' };
    }

    // deriveComparison is pure and in-process, called only for cheaperMenu.
    const comparison = deriveComparison(snapshot);
    const platform: OrderPlatform =
      comparison.cheaperMenu?.platform ??
      (snapshot.payload.ubereats.status === 'resolved' ? 'ubereats' : 'doordash');
    const menu = snapshot.payload[platform].menu; // the RAW capture, never deriveComparison's output
    if (menu.length === 0) {
      return { reason: 'no_menu', message: 'This Venue has no menu to order from.' };
    }

    const fields: Record<string, string> = {
      sessionCode,
      placeId,
      venueName: snapshot.venueName,
      platform,
      pricesAt: snapshot.fetchedAt,
      menu: JSON.stringify(menu),
      feeCents: '0',
      state: 'building',
    };
    const storeUrl = snapshot.payload[platform].storeUrl;
    if (storeUrl) fields.storeUrl = storeUrl; // hset rejects undefined
    if (comparison.cheaperMenu?.platform === platform) {
      fields.cheaperPercent = String(comparison.cheaperMenu.percent);
    }

    // ponytail: identical concurrent opens, no lock — both writers HSET byte-identical metadata derived
    // from the same Snapshot row, and no Order Line can exist before the open. If a Session ever needs two
    // live baskets, key the order hash by placeId.
    await store.openOrder(sessionCode, fields);
    return toOrderState(fields, {});
  }

  /**
   * Adds or removes one Order Line and returns the rebuilt state plus what
   * changed. `displayName` and the item name/price are server-resolved — the
   * client dictates neither who it acts as nor what a line costs.
   */
  async function addItem(
    sessionCode: string,
    participantId: string,
    index: number,
    delta: 1 | -1
  ): Promise<{ order: OrderState; change: { by: string; name: string; delta: 1 | -1 } }> {
    const hash = await store.readOrder(sessionCode);
    if (!hash) {
      throw new DomainError('SESSION_NOT_FOUND', 'Session not found');
    }
    if (hash.state === 'locked') {
      throw new DomainError('VALIDATION_ERROR', 'This order is locked');
    }
    const participant = await store.getParticipant(participantId);
    if (!participant || participant.sessionCode !== sessionCode) {
      throw new DomainError('NOT_IN_SESSION', 'You are not in this session');
    }
    const menu = JSON.parse(hash.menu) as MenuItemCapture[];
    if (!Number.isInteger(index) || index < 0 || index >= menu.length) {
      throw new DomainError('VALIDATION_ERROR', 'That item is not on the menu');
    }

    const displayName = participant.displayName;
    await store.addLine(sessionCode, index, displayName, delta);
    const order = toOrderState(hash, await store.readOrderLines(sessionCode));
    return { order, change: { by: displayName, name: menu[index].name, delta } };
  }

  return { open, addItem };
}
