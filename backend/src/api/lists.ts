// The Shopping List's endpoints (#262, #263). The URL is the whole capability
// (#229): no Participant check, ever, and no live Session — the housemate
// holding a forwarded link after the Session expired is the canonical reader,
// and the canonical claimer. Reading, claiming and releasing all answer with
// the same resource, so a client that just changed something needs no second
// request to see what it changed.
import { Router } from 'express';
import { z } from 'zod';
import { MAX_SHOPPER_NAME } from '@dinder/shared/types';
import type {
  ClaimLineRequest,
  ClaimLineResponse,
  ShoppingListResponse,
  SwapLineRequest,
  SwapLineResponse,
} from '@dinder/shared/types';
import { DomainError } from '../services/DomainError.js';
import type { ShoppingListService } from '../services/ShoppingListService.js';
import { asyncHandler } from './asyncHandler.js';

/**
 * The id shape mint hands out; anything else cannot name a list. Grouped
 * rather than a loose 36-character class, which would admit 36 hyphens — the
 * gate should reject what it says it rejects. Deliberately not v4-specific:
 * the generator is injectable, and the route has no stake in its version.
 */
const LIST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * An expired list, one that never existed, and a line no list has: all one
 * answer. The link is the capability, so its absence — and the absence of
 * anything under it — must reveal nothing either way.
 */
const notFound = () =>
  new DomainError('SHOPPING_LIST_NOT_FOUND', 'This shopping list has expired or does not exist');

// Annotated destructures below check these against the shared request types.
const claimLineRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(MAX_SHOPPER_NAME),
});
const swapLineRequestSchema = z.object({ stockcode: z.number().int().nullable() });

export function createListsRouter(service: ShoppingListService) {
  const router = Router();

  router.get(
    '/:listId',
    asyncHandler(async (req, res) => {
      const { listId } = req.params;
      const list = LIST_ID.test(listId) ? await service.readList(listId) : null;

      if (!list) {
        req.log?.warn({ listId, reason: 'list_not_found' }, 'Rejected shopping list read');
        throw notFound();
      }

      req.log?.info({ listId, lineCount: list.lines.length }, 'Returned shopping list');
      return res.status(200).json(list satisfies ShoppingListResponse);
    })
  );

  router.post(
    '/:listId/lines/:lineId/claim',
    asyncHandler(async (req, res) => {
      const { listId, lineId } = req.params;
      // A Shopper is a self-declared display name and nothing more (CONTEXT.md),
      // so the only thing to validate is that it is one: present, not
      // whitespace, short enough to render beside a line. Uniqueness is
      // deliberately not checked — there is no Session to check it against, and
      // two housemates who both type "Sam" have a problem the app cannot see.
      const parsed = claimLineRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new DomainError('VALIDATION_ERROR', 'A claim needs a display name');
      }
      const { displayName: name }: ClaimLineRequest = parsed.data;

      const list = LIST_ID.test(listId) ? await service.claimLine(listId, lineId, name) : null;
      if (!list) throw notFound();

      // Not necessarily this Shopper: the first tap won, and this may be the
      // second one being told so.
      const holder = list.lines.find((line) => line.id === lineId)?.claimedBy;
      req.log?.info({ listId, lineId, holder }, 'Claimed Ingredient Line');
      return res.status(200).json(list satisfies ClaimLineResponse);
    })
  );

  router.delete(
    '/:listId/lines/:lineId/claim',
    asyncHandler(async (req, res) => {
      const { listId, lineId } = req.params;
      // No name, on purpose: any Shopper may release any Claim, so asking whose
      // it is would collect an identity nothing is allowed to act on (#229).
      const list = LIST_ID.test(listId) ? await service.releaseLine(listId, lineId) : null;
      if (!list) throw notFound();

      req.log?.info({ listId, lineId }, 'Released Claim on Ingredient Line');
      return res.status(200).json(list satisfies ClaimLineResponse);
    })
  );

  router.post(
    '/:listId/lines/:lineId/swap',
    asyncHandler(async (req, res) => {
      const { listId, lineId } = req.params;
      // A Stockcode names one of the candidates the line already offered, and
      // null is "none of these". Nothing else is a swap: a free-form product id
      // would be a Retailer lookup asking to be let in through this door, and
      // whether *this* line offered *this* Stockcode is the service's to say.
      const parsed = swapLineRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new DomainError('VALIDATION_ERROR', 'A swap needs a Stockcode, or null for none');
      }
      const { stockcode }: SwapLineRequest = parsed.data;

      const list = LIST_ID.test(listId) ? await service.swapLine(listId, lineId, stockcode) : null;
      if (!list) throw notFound();

      req.log?.info({ listId, lineId, stockcode }, 'Swapped Ingredient Line');
      return res.status(200).json(list satisfies SwapLineResponse);
    })
  );

  return router;
}
