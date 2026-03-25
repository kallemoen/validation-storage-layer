import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth } from '../../src/middleware/auth.js';
import { handleError } from '../../src/middleware/error-handler.js';
import { success, error } from '../../src/lib/response.js';
import { ScraperRegistryInputSchema } from '../../src/types/scraper.js';
import { registerScraper } from '../../src/db/scrapers.js';

export default withAuth(['development'], async (req, res) => {
  if (req.method !== 'POST') {
    error(res, 'METHOD_NOT_ALLOWED', 'Only POST is allowed', 405);
    return;
  }

  try {
    const parsed = ScraperRegistryInputSchema.safeParse(req.body);
    if (!parsed.success) {
      error(res, 'INVALID_REQUEST', 'Invalid request body', 400, parsed.error.issues);
      return;
    }

    const scraper = await registerScraper(parsed.data);
    success(res, scraper, 201);
  } catch (err) {
    handleError(res, err);
  }
});
