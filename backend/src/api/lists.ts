// The Shopping List's read endpoint (#262). The URL is the whole capability
// (#229): no Participant check, ever, and no live Session — the housemate
// holding a forwarded link after the Session expired is the canonical reader.
// Deliberately read-only here; Claims arrive with #263.
import { Router } from 'express';
import type { ShoppingListResponse } from '@dinder/shared/types';
import { DomainError } from '../services/DomainError.js';
import type { ShoppingListService } from '../services/ShoppingListService.js';
import { asyncHandler } from './asyncHandler.js';

/** The id shape mint hands out; anything else cannot name a list. */
const LIST_ID = /^[0-9a-f-]{36}$/i;

export function createListsRouter(service: ShoppingListService) {
  const router = Router();

  router.get(
    '/:listId',
    asyncHandler(async (req, res) => {
      const { listId } = req.params;
      const list = LIST_ID.test(listId) ? await service.readList(listId) : null;

      if (!list) {
        req.log?.warn({ listId, reason: 'list_not_found' }, 'Rejected shopping list read');
        // An expired list and one that never existed answer identically: the
        // link is the capability, so its absence reveals nothing either way.
        throw new DomainError('SHOPPING_LIST_NOT_FOUND', 'This shopping list has expired or does not exist');
      }

      req.log?.info({ listId, lineCount: list.lines.length }, 'Returned shopping list');
      return res.status(200).json(list satisfies ShoppingListResponse);
    })
  );

  return router;
}
