import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth } from '../../src/middleware/auth.js';
import { handleError } from '../../src/middleware/error-handler.js';
import { success, error } from '../../src/lib/response.js';
import { validateBatch } from '../../src/validation/engine.js';
import { getScraperById } from '../../src/db/scrapers.js';
import { storeRejection } from '../../src/db/rejections.js';
import { COUNTRY_BOUNDS } from '../../src/validation/config/country-bounds.js';
import { PRICE_RANGES } from '../../src/validation/config/price-ranges.js';

const MAX_BATCH_SIZE = 100;

export default withAuth(['development'], async (req, res) => {
  if (req.method !== 'POST') {
    error(res, 'METHOD_NOT_ALLOWED', 'Only POST is allowed', 405);
    return;
  }

  try {
    const body = req.body as { listings?: unknown[] };
    if (!body?.listings || !Array.isArray(body.listings)) {
      error(res, 'INVALID_REQUEST', 'Request body must contain a "listings" array');
      return;
    }

    if (body.listings.length > MAX_BATCH_SIZE) {
      error(res, 'BATCH_TOO_LARGE', `Maximum batch size is ${MAX_BATCH_SIZE}`);
      return;
    }

    // All listings in a batch must share the same config_id
    const configId = (body.listings[0] as Record<string, unknown>)?.config_id as string;
    if (!configId) {
      error(res, 'INVALID_REQUEST', 'First listing must have a config_id');
      return;
    }

    const scraper = await getScraperById(configId);
    if (!scraper) {
      error(res, 'NOT_FOUND', `Scraper config '${configId}' not found`, 404);
      return;
    }

    const context = {
      scraperConfig: scraper,
      countryBounds: COUNTRY_BOUNDS,
      priceRanges: PRICE_RANGES,
    };

    const result = validateBatch(body.listings as Record<string, unknown>[], context, 'test');

    // Store rejection records
    for (const r of result.results) {
      if (r.status === 'rejected') {
        const listingData = body.listings.find(
          (l) => (l as Record<string, unknown>).listing_id === r.listing_id,
        ) as Record<string, unknown>;
        if (listingData) {
          await storeRejection(configId, 'test', listingData, r);
        }
      }
    }

    success(res, result);
  } catch (err) {
    handleError(res, err);
  }
});
