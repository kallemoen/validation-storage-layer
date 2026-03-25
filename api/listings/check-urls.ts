import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth } from '../../src/middleware/auth.js';
import { handleError } from '../../src/middleware/error-handler.js';
import { success, error } from '../../src/lib/response.js';
import { checkExistingUrls } from '../../src/db/listings.js';

export default withAuth(['collection'], async (req, res) => {
  if (req.method !== 'POST') {
    error(res, 'METHOD_NOT_ALLOWED', 'Only POST is allowed', 405);
    return;
  }

  try {
    const body = req.body as { urls?: string[] };
    if (!body?.urls || !Array.isArray(body.urls)) {
      error(res, 'INVALID_REQUEST', 'Request body must contain a "urls" array');
      return;
    }

    if (body.urls.length > 1000) {
      error(res, 'BATCH_TOO_LARGE', 'Maximum 1000 URLs per request');
      return;
    }

    const existingUrls = await checkExistingUrls(body.urls);
    success(res, { existing_urls: existingUrls });
  } catch (err) {
    handleError(res, err);
  }
});
