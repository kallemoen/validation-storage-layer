import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth } from '../../../src/middleware/auth.js';
import { handleError } from '../../../src/middleware/error-handler.js';
import { success, error } from '../../../src/lib/response.js';
import { validateListing } from '../../../src/validation/engine.js';
import { getRejectionById } from '../../../src/db/rejections.js';
import { getScraperById } from '../../../src/db/scrapers.js';
import { COUNTRY_BOUNDS } from '../../../src/validation/config/country-bounds.js';
import { PRICE_RANGES } from '../../../src/validation/config/price-ranges.js';

export default withAuth(['development'], async (req, res) => {
  if (req.method !== 'POST') {
    error(res, 'METHOD_NOT_ALLOWED', 'Only POST is allowed', 405);
    return;
  }

  try {
    const rejectionId = req.query.rejection_id as string;
    if (!rejectionId) {
      error(res, 'INVALID_REQUEST', 'Rejection ID is required');
      return;
    }

    const rejection = await getRejectionById(rejectionId);
    if (!rejection) {
      error(res, 'NOT_FOUND', `Rejection '${rejectionId}' not found`, 404);
      return;
    }

    const scraper = await getScraperById(rejection.config_id);
    if (!scraper) {
      error(res, 'NOT_FOUND', `Scraper config '${rejection.config_id}' not found`, 404);
      return;
    }

    const context = {
      scraperConfig: scraper,
      countryBounds: COUNTRY_BOUNDS,
      priceRanges: PRICE_RANGES,
    };

    const result = validateListing(rejection.listing_data as Record<string, unknown>, context, 'test');

    success(res, {
      original_rejection_id: rejectionId,
      replay_result: result,
    });
  } catch (err) {
    handleError(res, err);
  }
});
