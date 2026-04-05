import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth } from '../../src/middleware/auth.js';
import { handleError } from '../../src/middleware/error-handler.js';
import { success, error } from '../../src/lib/response.js';
import { getRejectionSummary } from '../../src/db/rejections.js';

export default withAuth(['development', 'collection', 'admin', 'reader'], async (req, res) => {
  if (req.method !== 'GET') {
    error(res, 'METHOD_NOT_ALLOWED', 'Only GET is allowed', 405);
    return;
  }

  try {
    const filters = {
      config_id: req.query.config_id as string | undefined,
      since: req.query.since as string | undefined,
    };

    const result = await getRejectionSummary(filters);
    success(res, result);
  } catch (err) {
    handleError(res, err);
  }
});
