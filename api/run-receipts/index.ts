import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth } from '../../src/middleware/auth.js';
import { handleError } from '../../src/middleware/error-handler.js';
import { success, error } from '../../src/lib/response.js';
import { queryRunReceipts } from '../../src/db/run-receipts.js';

export default withAuth(['development', 'collection', 'admin'], async (req, res) => {
  if (req.method !== 'GET') {
    error(res, 'METHOD_NOT_ALLOWED', 'Only GET is allowed', 405);
    return;
  }

  try {
    const filters = {
      config_id: req.query.config_id as string | undefined,
      status: req.query.status as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
    };

    const result = await queryRunReceipts(filters);
    success(res, result);
  } catch (err) {
    handleError(res, err);
  }
});
