import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth } from '../../src/middleware/auth.js';
import { handleError } from '../../src/middleware/error-handler.js';
import { success, error } from '../../src/lib/response.js';
import { validateBatch } from '../../src/validation/engine.js';
import { getScraperById } from '../../src/db/scrapers.js';
import { insertListingsBatch } from '../../src/db/listings.js';
import { storeRejection } from '../../src/db/rejections.js';
import { COUNTRY_BOUNDS } from '../../src/validation/config/country-bounds.js';
import { PRICE_RANGES } from '../../src/validation/config/price-ranges.js';
import { loadGeographyLookup } from '../../src/validation/config/geography-lookup.js';
import type { ListingInput } from '../../src/types/listing.js';
import { enrichLocation, DisplayCoordinateError } from '../../src/enrichment/location-enricher.js';

const MAX_BATCH_SIZE = 100;

export default withAuth(['collection'], async (req, res) => {
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

    const geographyLookup = await loadGeographyLookup();

    const context = {
      scraperConfig: scraper,
      countryBounds: COUNTRY_BOUNDS,
      priceRanges: PRICE_RANGES,
      geographyLookup,
    };

    const batchResult = validateBatch(body.listings as Record<string, unknown>[], context, 'live');

    // Store rejection records
    for (const r of batchResult.results) {
      if (r.status === 'rejected') {
        const listingData = body.listings.find(
          (l) => (l as Record<string, unknown>).listing_id === r.listing_id,
        ) as Record<string, unknown>;
        if (listingData) {
          await storeRejection(configId, 'live', listingData, r);
        }
      }
    }

    // Insert accepted listings
    const listings = body.listings!;
    const acceptedListings = batchResult.results
      .filter(r => r.status === 'accepted' || r.status === 'accepted_with_warnings')
      .map(r => listings.find(
        (l) => (l as Record<string, unknown>).listing_id === r.listing_id,
      ) as unknown as ListingInput)
      .filter(Boolean);

    let insertResult = { inserted: 0, duplicates: [] as string[] };
    const enrichmentErrors: Array<{ listing_id: string; error: string }> = [];
    if (acceptedListings.length > 0) {
      const enrichResults = await Promise.allSettled(acceptedListings.map(l => enrichLocation(l)));
      const enriched = enrichResults
        .map((r, i) => {
          if (r.status === 'fulfilled') return r.value;
          const lid = acceptedListings[i].listing_id;
          const msg = r.reason instanceof DisplayCoordinateError
            ? r.reason.message
            : `Enrichment failed: ${r.reason?.message ?? 'unknown error'}`;
          console.error(`Enrichment failed for ${lid}: ${msg}`);
          enrichmentErrors.push({ listing_id: lid, error: msg });
          return null;
        })
        .filter(Boolean) as import('../../src/types/listing.js').ListingInsertRow[];

      if (enriched.length > 0) {
        insertResult = await insertListingsBatch(enriched);
      }
    }

    success(res, {
      validation: batchResult,
      storage: {
        inserted: insertResult.inserted,
        duplicates: insertResult.duplicates,
        ...(enrichmentErrors.length > 0 && { enrichment_errors: enrichmentErrors }),
      },
    }, 201);
  } catch (err) {
    handleError(res, err);
  }
});
