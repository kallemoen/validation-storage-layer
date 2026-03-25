import { findRegionByPoint } from '../db/admin-regions.js';
import { getAdminLevelConfig } from '../db/admin-regions.js';

export interface PostGISGeocodingResult {
  admin_level_1?: string;
  admin_level_2?: string;
  admin_level_3?: string;
}

/**
 * Reverse geocode coordinates using PostGIS polygon lookups against our reference data.
 * Returns null if the country has no polygon data loaded.
 */
export async function reverseGeocodePostGIS(
  countryCode: string,
  lat: number,
  lng: number,
): Promise<PostGISGeocodingResult | null> {
  const config = await getAdminLevelConfig(countryCode);
  if (!config) return null;

  const result: PostGISGeocodingResult = {};

  for (let level = 1; level <= config.max_level; level++) {
    try {
      const region = await findRegionByPoint(countryCode, level, lat, lng);
      if (region) {
        const key = `admin_level_${level}` as keyof PostGISGeocodingResult;
        result[key] = region.name;
      }
    } catch {
      // Non-blocking: if a level fails, continue with the next
    }
  }

  // Only return if we found at least one level
  return Object.keys(result).length > 0 ? result : null;
}
