import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth } from '../../../src/middleware/auth.js';
import { handleError } from '../../../src/middleware/error-handler.js';
import { success, error } from '../../../src/lib/response.js';
import { PriceUpdateSchema } from '../../../src/types/operations.js';
import { updateListingPrice } from '../../../src/db/listings.js';

export default withAuth(['collection'], async (req, res) => {
  if (req.method !== 'PATCH') {
    error(res, 'METHOD_NOT_ALLOWED', 'Only PATCH is allowed', 405);
    return;
  }

  try {
    const listingId = req.query.id as string;
    if (!listingId) {
      error(res, 'INVALID_REQUEST', 'Listing ID is required');
      return;
    }

    const parsed = PriceUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      error(res, 'INVALID_REQUEST', 'Invalid request body', 400, parsed.error.issues);
      return;
    }

    const result = await updateListingPrice(
      listingId,
      parsed.data.price_amount,
      parsed.data.price_currency_code,
    );

    if (!result) {
      error(res, 'NOT_FOUND', `Listing '${listingId}' not found`, 404);
      return;
    }

    success(res, { listing_id: listingId, price_changed: result.changed });
  } catch (err) {
    handleError(res, err);
  }
});
