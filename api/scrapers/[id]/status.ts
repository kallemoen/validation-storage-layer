import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth } from '../../../src/middleware/auth.js';
import { handleError } from '../../../src/middleware/error-handler.js';
import { success, error } from '../../../src/lib/response.js';
import { ScraperStatusUpdateSchema } from '../../../src/types/operations.js';
import { updateScraperStatus } from '../../../src/db/scrapers.js';

export default withAuth(['development', 'admin'], async (req, res) => {
  if (req.method !== 'PATCH') {
    error(res, 'METHOD_NOT_ALLOWED', 'Only PATCH is allowed', 405);
    return;
  }

  try {
    const configId = req.query.id as string;
    if (!configId) {
      error(res, 'INVALID_REQUEST', 'Scraper config ID is required');
      return;
    }

    const parsed = ScraperStatusUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      error(res, 'INVALID_REQUEST', 'Invalid request body', 400, parsed.error.issues);
      return;
    }

    const result = await updateScraperStatus(configId, parsed.data.status);

    if (!result) {
      error(res, 'NOT_FOUND', `Scraper config '${configId}' not found`, 404);
      return;
    }

    success(res, { config_id: configId, status: parsed.data.status });
  } catch (err) {
    handleError(res, err);
  }
});
