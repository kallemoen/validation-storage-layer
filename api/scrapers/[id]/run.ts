import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth } from '../../../src/middleware/auth.js';
import { handleError } from '../../../src/middleware/error-handler.js';
import { success, error } from '../../../src/lib/response.js';
import { RunResultSchema } from '../../../src/types/operations.js';
import { updateScraperRunResult, updateScraperRunHealth } from '../../../src/db/scrapers.js';
import { storeRunReceipt } from '../../../src/db/run-receipts.js';

export default withAuth(['collection'], async (req, res) => {
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

    const parsed = RunResultSchema.safeParse(req.body);
    if (!parsed.success) {
      error(res, 'INVALID_REQUEST', 'Invalid request body', 400, parsed.error.issues);
      return;
    }

    // Store the run receipt
    const receipt = await storeRunReceipt(configId, parsed.data);

    // Update scraper registry (heartbeat + run metadata)
    const result = await updateScraperRunResult(configId, {
      status: parsed.data.status,
      listings_accepted: parsed.data.listings_accepted,
    });

    if (!result) {
      error(res, 'NOT_FOUND', `Scraper config '${configId}' not found`, 404);
      return;
    }

    // Evaluate pipeline health checks using run data
    const healthResult = await updateScraperRunHealth(configId, {
      urls_discovered: parsed.data.urls_discovered ?? 0,
      urls_new: parsed.data.urls_new ?? 0,
      listings_submitted: parsed.data.listings_submitted ?? 0,
    });

    success(res, {
      receipt_id: receipt.id,
      ...result,
      ...(healthResult && {
        scraper_health: {
          status: healthResult.status,
          status_reason: healthResult.status_reason,
          status_changed: healthResult.status_changed,
        },
      }),
    });
  } catch (err) {
    handleError(res, err);
  }
});
