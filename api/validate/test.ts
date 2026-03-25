import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth } from '../../src/middleware/auth.js';
import { handleError } from '../../src/middleware/error-handler.js';
import { success, error } from '../../src/lib/response.js';
import { validateListing } from '../../src/validation/engine.js';
import { getScraperById } from '../../src/db/scrapers.js';
import { storeRejection } from '../../src/db/rejections.js';
import { COUNTRY_BOUNDS } from '../../src/validation/config/country-bounds.js';
import { PRICE_RANGES } from '../../src/validation/config/price-ranges.js';
import { loadGeographyLookup } from '../../src/validation/config/geography-lookup.js';

export default withAuth(['development'], async (req, res) => {
  if (req.method !== 'POST') {
    error(res, 'METHOD_NOT_ALLOWED', 'Only POST is allowed', 405);
    return;
  }

  try {
    const input = req.body as Record<string, unknown>;
    if (!input || typeof input !== 'object') {
      error(res, 'INVALID_REQUEST', 'Request body must be a JSON object');
      return;
    }

    const configId = input.config_id as string;
    if (!configId) {
      error(res, 'INVALID_REQUEST', 'config_id is required');
      return;
    }

    const scraper = await getScraperById(configId);
    if (!scraper) {
      error(res, 'NOT_FOUND', `Scraper config '${configId}' not found`, 404);
      return;
    }

    const geographyLookup = await loadGeographyLookup();

    const context = {
      scraperConfig: scraper,
      countryBounds: COUNTRY_BOUNDS,
      priceRanges: PRICE_RANGES,
      geographyLookup,
    };

    const result = validateListing(input, context, 'test');

    // Store rejection record if rejected
    if (result.status === 'rejected') {
      await storeRejection(configId, 'test', input, result);
    }

    success(res, result);
  } catch (err) {
    handleError(res, err);
  }
});
