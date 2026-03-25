import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth } from '../../../src/middleware/auth.js';
import { handleError } from '../../../src/middleware/error-handler.js';
import { success, error } from '../../../src/lib/response.js';
import { StatusUpdateSchema } from '../../../src/types/operations.js';
import { updateListingStatus } from '../../../src/db/listings.js';

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

    const parsed = StatusUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      error(res, 'INVALID_REQUEST', 'Invalid request body', 400, parsed.error.issues);
      return;
    }

    const updated = await updateListingStatus(listingId, parsed.data.listing_status);

    if (!updated) {
      error(res, 'NOT_FOUND', `Listing '${listingId}' not found`, 404);
      return;
    }

    success(res, { listing_id: listingId, listing_status: parsed.data.listing_status });
  } catch (err) {
    handleError(res, err);
  }
});
