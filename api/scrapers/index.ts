import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth } from '../../src/middleware/auth.js';
import { handleError } from '../../src/middleware/error-handler.js';
import { success, error } from '../../src/lib/response.js';
import { queryScrapers } from '../../src/db/scrapers.js';

export default withAuth(['development', 'collection', 'admin'], async (req, res) => {
  if (req.method !== 'GET') {
    error(res, 'METHOD_NOT_ALLOWED', 'Only GET is allowed', 405);
    return;
  }

  try {
    const filters = {
      status: req.query.status as string | undefined,
      country_code: req.query.country_code as string | undefined,
      listing_type: req.query.listing_type as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
    };

    const result = await queryScrapers(filters);
    success(res, result);
  } catch (err) {
    handleError(res, err);
  }
});
