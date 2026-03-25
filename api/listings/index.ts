import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth } from '../../src/middleware/auth.js';
import { handleError } from '../../src/middleware/error-handler.js';
import { success, error } from '../../src/lib/response.js';
import { validateListing } from '../../src/validation/engine.js';
import { getScraperById } from '../../src/db/scrapers.js';
import { insertListing, DuplicateUrlError, queryListings } from '../../src/db/listings.js';
import { storeRejection } from '../../src/db/rejections.js';
import { COUNTRY_BOUNDS } from '../../src/validation/config/country-bounds.js';
import { PRICE_RANGES } from '../../src/validation/config/price-ranges.js';
import type { ListingInput } from '../../src/types/listing.js';
import { enrichLocation } from '../../src/enrichment/location-enricher.js';

export default withAuth(['development', 'collection', 'admin'], async (req, res) => {
  try {
    if (req.method === 'GET') {
      return await handleGet(req, res);
    }
    if (req.method === 'POST') {
      if (req.appRole !== 'collection') {
        error(res, 'FORBIDDEN', 'Only collection role can submit live listings', 403);
        return;
      }
      return await handlePost(req, res);
    }
    error(res, 'METHOD_NOT_ALLOWED', 'Only GET and POST are allowed', 405);
  } catch (err) {
    handleError(res, err);
  }
});

async function handleGet(req: VercelRequest, res: VercelResponse) {
  const filters = {
    config_id: req.query.config_id as string | undefined,
    country_code: req.query.country_code as string | undefined,
    listing_type: req.query.listing_type as string | undefined,
    listing_status: req.query.listing_status as string | undefined,
    limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
  };

  const result = await queryListings(filters);
  success(res, result);
}

async function handlePost(req: VercelRequest, res: VercelResponse) {
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

  const context = {
    scraperConfig: scraper,
    countryBounds: COUNTRY_BOUNDS,
    priceRanges: PRICE_RANGES,
  };

  const result = validateListing(input, context, 'live');

  if (result.status === 'rejected') {
    await storeRejection(configId, 'live', input, result);
    success(res, result);
    return;
  }

  // Accepted — enrich location and insert into database
  try {
    const enriched = await enrichLocation(input as unknown as ListingInput);
    await insertListing(enriched);
    success(res, result, 201);
  } catch (err) {
    if (err instanceof DuplicateUrlError) {
      error(res, 'DUPLICATE', err.message, 409);
      return;
    }
    throw err;
  }
}
