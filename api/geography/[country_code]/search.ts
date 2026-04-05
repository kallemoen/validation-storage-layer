import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth } from '../../../src/middleware/auth.js';
import { handleError } from '../../../src/middleware/error-handler.js';
import { success, error } from '../../../src/lib/response.js';
import { getRegionsForCountry, searchRegions } from '../../../src/db/admin-regions.js';
import type { AdminRegion } from '../../../src/types/geography.js';

interface SearchResult {
  name: string;
  level: number;
  path: string;
}

function buildPath(region: AdminRegion, byId: Map<number, AdminRegion>): string {
  const parts: string[] = [];
  let current: AdminRegion | undefined = region;

  while (current) {
    parts.unshift(current.name);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }

  return parts.join(' > ');
}

export default withAuth(['development', 'collection', 'reader'], async (req, res) => {
  if (req.method !== 'GET') {
    error(res, 'METHOD_NOT_ALLOWED', 'Only GET is allowed', 405);
    return;
  }

  try {
    const countryCode = (req.query.country_code as string).toUpperCase();
    if (!countryCode || countryCode.length !== 2) {
      error(res, 'INVALID_REQUEST', 'country_code must be a 2-letter ISO code');
      return;
    }

    const query = req.query.q as string | undefined;
    if (!query || query.trim().length === 0) {
      error(res, 'INVALID_REQUEST', 'Query parameter "q" is required');
      return;
    }

    const levelParam = req.query.level as string | undefined;
    const level = levelParam !== undefined ? parseInt(levelParam, 10) : undefined;
    if (levelParam !== undefined && (isNaN(level!) || level! < 1)) {
      error(res, 'INVALID_REQUEST', 'level must be a positive integer');
      return;
    }

    const [matches, allRegions] = await Promise.all([
      searchRegions(countryCode, query.trim(), level),
      getRegionsForCountry(countryCode),
    ]);

    if (allRegions.length === 0) {
      error(res, 'NOT_FOUND', `No geography data found for country '${countryCode}'`, 404);
      return;
    }

    // Build lookup map for path resolution
    const byId = new Map<number, AdminRegion>();
    for (const r of allRegions) {
      byId.set(r.id, r);
    }

    const results: SearchResult[] = matches.map((m) => ({
      name: m.name,
      level: m.level,
      path: buildPath(m, byId),
    }));

    success(res, {
      country_code: countryCode,
      query: query.trim(),
      count: results.length,
      results,
    });
  } catch (err) {
    handleError(res, err);
  }
});
