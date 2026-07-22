// WebSocket handler for order:open — pure transport over OrderService.open.
// order:open is a read/upsert, not a mutation: it acks and broadcasts nothing
// (OrderStateEvent.change is optional, so an open-broadcast can be added later
// with zero contract change — ADR 0007).

import { logger } from '../logger.js';
import type { Socket } from 'socket.io';
import { z } from 'zod';
import type { OrderService } from '../services/OrderService.js';
import { DomainError } from '../services/DomainError.js';
import { toApiError } from '../api/toApiError.js';
import {
  SESSION_CODE_PATTERN,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type OrderOpenPayload,
  type OrderOpenResponse,
} from '@dinder/shared/types';

const orderOpenPayloadSchema = z.object({
  sessionCode: z.string().regex(SESSION_CODE_PATTERN),
  placeId: z.string().min(1),
});

export async function handleOrderOpen(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  payload: OrderOpenPayload,
  callback: (response: OrderOpenResponse) => void,
  service: OrderService
): Promise<void> {
  try {
    const validation = orderOpenPayloadSchema.safeParse(payload);
    if (!validation.success) {
      const reason = validation.error.errors[0].message;
      logger.warn(
        {
          socketId: socket.id,
          sessionCode: (payload as Partial<OrderOpenPayload>).sessionCode,
          reason,
        },
        'Rejected order:open'
      );
      return callback({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: reason },
      });
    }

    const { sessionCode, placeId } = validation.data;

    let result: Awaited<ReturnType<OrderService['open']>>;
    try {
      result = await service.open(sessionCode, socket.id, placeId);
    } catch (error) {
      if (!(error instanceof DomainError)) {
        throw error;
      }
      logger.warn({ socketId: socket.id, sessionCode, reason: error.code }, 'Rejected order:open');
      return callback({ success: false, error: toApiError(error).body });
    }

    if ('reason' in result) {
      return callback({
        success: false,
        error: { code: 'NOT_FOUND', message: result.message, reason: result.reason },
      });
    }

    callback({ success: true, data: result });
    logger.info({ socketId: socket.id, sessionCode, placeId }, 'Group Order opened');
  } catch (error) {
    logger.error({ err: error, socketId: socket.id }, 'Error in order:open handler');
    callback({ success: false, error: toApiError(error).body });
  }
}
