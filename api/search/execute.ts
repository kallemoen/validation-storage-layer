import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth } from '../../src/middleware/auth.js';
import { handleError } from '../../src/middleware/error-handler.js';
import { success, error } from '../../src/lib/response.js';
import { ExecuteQuerySchema } from '../../src/types/search.js';
import { executeReadonlyQuery } from '../../src/db/search.js';

export default withAuth(['admin'], async (req, res) => {
  if (req.method !== 'POST') {
    error(res, 'METHOD_NOT_ALLOWED', 'Only POST is allowed', 405);
    return;
  }

  try {
    const parsed = ExecuteQuerySchema.safeParse(req.body);
    if (!parsed.success) {
      error(res, 'INVALID_REQUEST', 'Invalid request body', 400, parsed.error.issues);
      return;
    }

    const rows = await executeReadonlyQuery(parsed.data.sql);
    const rowArray = Array.isArray(rows) ? rows : [];

    success(res, { rows: rowArray, row_count: rowArray.length });
  } catch (err) {
    handleError(res, err);
  }
});
