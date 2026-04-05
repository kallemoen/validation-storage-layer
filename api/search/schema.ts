import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth } from '../../src/middleware/auth.js';
import { handleError } from '../../src/middleware/error-handler.js';
import { success, error } from '../../src/lib/response.js';
import { getTableSchema } from '../../src/db/search.js';

export default withAuth(['admin', 'reader'], async (req, res) => {
  if (req.method !== 'GET') {
    error(res, 'METHOD_NOT_ALLOWED', 'Only GET is allowed', 405);
    return;
  }

  try {
    const schema = await getTableSchema();
    success(res, schema);
  } catch (err) {
    handleError(res, err);
  }
});
