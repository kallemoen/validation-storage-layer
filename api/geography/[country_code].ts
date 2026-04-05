import type { VercelRequest, VercelResponse } from '@vercel/node';
import { withAuth } from '../../src/middleware/auth.js';
import { handleError } from '../../src/middleware/error-handler.js';
import { success, error } from '../../src/lib/response.js';
import { getRegionsForCountry, getAdminLevelConfig } from '../../src/db/admin-regions.js';
import type { AdminRegion } from '../../src/types/geography.js';

interface RegionNode {
  name: string;
  level: number;
  children: RegionNode[];
}

interface LevelInfo {
  label: string;
  count: number;
}

function buildTree(regions: AdminRegion[]): RegionNode[] {
  const byId = new Map<number, RegionNode>();
  const roots: RegionNode[] = [];

  for (const r of regions) {
    byId.set(r.id, { name: r.name, level: r.level, children: [] });
  }

  for (const r of regions) {
    const node = byId.get(r.id)!;
    if (r.parent_id && byId.has(r.parent_id)) {
      byId.get(r.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
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

    const levelParam = req.query.level as string | undefined;
    const parentParam = req.query.parent as string | undefined;

    const [regions, config] = await Promise.all([
      getRegionsForCountry(countryCode),
      getAdminLevelConfig(countryCode),
    ]);

    if (!config) {
      error(res, 'NOT_FOUND', `No geography configuration found for country '${countryCode}'`, 404);
      return;
    }

    // Filter by level: return flat list
    if (levelParam !== undefined) {
      const level = parseInt(levelParam, 10);
      if (isNaN(level) || level < 1 || level > config.max_level) {
        error(res, 'INVALID_REQUEST', `level must be between 1 and ${config.max_level}`);
        return;
      }

      const filtered = regions
        .filter((r) => r.level === level)
        .map((r) => ({ name: r.name, level: r.level }));

      success(res, { country_code: countryCode, regions: filtered });
      return;
    }

    // Filter by parent: return children of a specific region
    if (parentParam !== undefined) {
      const parent = regions.find(
        (r) => r.name.toLowerCase() === parentParam.toLowerCase(),
      );
      if (!parent) {
        error(res, 'NOT_FOUND', `Region '${parentParam}' not found in ${countryCode}`, 404);
        return;
      }

      const children = regions
        .filter((r) => r.parent_id === parent.id)
        .map((r) => ({ name: r.name, level: r.level }));

      success(res, { country_code: countryCode, parent: parent.name, children });
      return;
    }

    // Default: full hierarchy tree
    const levels: Record<number, LevelInfo> = {};
    for (let l = 1; l <= config.max_level; l++) {
      const labelKey = `level_${l}_label` as keyof typeof config;
      const label = config[labelKey] as string | null;
      if (label) {
        levels[l] = {
          label,
          count: regions.filter((r) => r.level === l).length,
        };
      }
    }

    const tree = buildTree(regions);

    success(res, {
      country_code: countryCode,
      levels,
      regions: tree,
    });
  } catch (err) {
    handleError(res, err);
  }
});
