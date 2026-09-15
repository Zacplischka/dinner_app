// WebSocket handlers for the Group Order — pure transport over OrderService
// (order:open, order:item, order:buy). order:open is a read/upsert, not a
// mutation: it acks and broadcasts nothing (OrderStateEvent.change is optional,
// so an open-broadcast can be added later with zero contract change — ADR 0007).

import { logger } from '../logger.js';
import type { Socket, Server } from 'socket.io';
import { z } from 'zod';
import type { OrderService } from '../services/OrderService.js';
import { runCommand } from './runCommand.js';
import {
  SESSION_CODE_PATTERN,
  type Ack,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type OrderOpenPayload,
  type OrderOpenResponse,
  type OrderItemPayload,
  type OrderBuyPayload,
  type OrderBuyResponse,
  type OrderState,
} from '@dinder/shared/types';

const orderOpenPayloadSchema = z.object({
  sessionCode: z.string().regex(SESSION_CODE_PATTERN),
  placeId: z.string().min(1),
});

const orderItemPayloadSchema = z.object({
  sessionCode: z.string().regex(SESSION_CODE_PATTERN),
  index: z.number().int().min(0),
  delta: z.union([z.literal(1), z.literal(-1)]),
});

const orderBuyPayloadSchema = z.object({
  sessionCode: z.string().regex(SESSION_CODE_PATTERN),
  feeCents: z.number().int().min(0).max(100000).optional(),
});

// The ~4 KB Pinned Menu rides only the order:open ack — the one place the
// frontend reads it. Every order:state broadcast strips it here, at the point
// of emission, so a few taps around the table don't re-download the frozen
// menu to every phone.
function withoutMenu(order: OrderState): OrderState {
  const rest = { ...order };
  delete rest.menu;
  return rest;
}

export async function handleOrderOpen(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  payload: OrderOpenPayload,
  callback: (response: OrderOpenResponse) => void,
  service: OrderService
): Promise<void> {
  await runCommand<OrderOpenPayload, OrderState>(
    'order:open',
    socket.id,
    orderOpenPayloadSchema,
    payload,
    callback,
    async ({ sessionCode, placeId }, ack) => {
      const result = await service.open(sessionCode, socket.id, placeId);
      if ('reason' in result) {
        return callback({
          success: false,
          error: { code: 'NOT_FOUND', message: result.message, reason: result.reason },
        });
      }
      ack(result);
      logger.info({ socketId: socket.id, sessionCode, placeId }, 'Group Order opened');
    }
  );
}

export async function handleOrderItem(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  payload: OrderItemPayload,
  callback: (response: Ack<null>) => void,
  service: OrderService
): Promise<void> {
  await runCommand(
    'order:item',
    socket.id,
    orderItemPayloadSchema,
    payload,
    callback,
    async ({ sessionCode, index, delta }, ack) => {
      const { order, change } = await service.addItem(sessionCode, socket.id, index, delta);

      // Ack before broadcast, and broadcast to the whole room INCLUDING the sender
      // (io.in, not socket.to) so no client holds a local optimistic copy. A
      // no-op decrement (absent line) produces no change → nothing to broadcast.
      ack(null);
      if (change) {
        io.in(sessionCode).emit('order:state', { sessionCode, order: withoutMenu(order), change });
        logger.info({ socketId: socket.id, sessionCode, index, delta }, 'Order Line changed');
      }
    }
  );
}

export async function handleOrderBuy(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  payload: OrderBuyPayload,
  callback: (response: OrderBuyResponse) => void,
  service: OrderService
): Promise<void> {
  await runCommand(
    'order:buy',
    socket.id,
    orderBuyPayloadSchema,
    payload,
    callback,
    async ({ sessionCode, feeCents }, ack) => {
      const order = await service.claimBuyer(sessionCode, socket.id, feeCents);

      // Ack before broadcast, and broadcast to the whole room INCLUDING the
      // sender (io.in, not socket.to) — no `change` field, the lock is not an
      // item mutation.
      ack(null);
      io.in(sessionCode).emit('order:state', { sessionCode, order: withoutMenu(order) });
      logger.info(
        { socketId: socket.id, sessionCode, buyer: order.buyer },
        'Buyer claimed group order'
      );
    }
  );
}
