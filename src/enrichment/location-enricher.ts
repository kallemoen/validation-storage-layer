import type { ListingInput, LocationGranularity } from '../types/listing.js';
import type { ListingInsertRow } from '../types/listing.js';
import type { GeocodingResult } from './geocoding.js';
import { getGeocodingProvider } from './geocoding.js';
import { reverseGeocodePostGIS } from './postgis-geocoder.js';
import { getRandomPointInRegion, getAdminLevelConfig } from '../db/admin-regions.js';

/**
 * Enriches location data on a listing based on what's already provided.
 * Computes display coordinates server-side (scrapers cannot set them).
 * Non-blocking: if geocoding fails, returns the listing unchanged.
 */
export async function enrichLocation(input: ListingInput): Promise<ListingInsertRow> {
  // Strip any display coordinates from scraper input — these are server-computed
  const { display_latitude, display_longitude, ...cleaned } = input as ListingInput & {
    display_latitude?: unknown;
    display_longitude?: unknown;
  };

  const provider = getGeocodingProvider();
  let enriched: ListingInput = cleaned;
  const granularity = cleaned.location_granularity;

  try {
    // PostGIS enrichment (backfill admin levels from coordinates) — no external provider needed
    if (granularity === 'coordinates' || granularity === 'address') {
      enriched = await enrichFromPostGIS(cleaned);
    }

    // External provider enrichment (Mapbox) — only when configured
    if (provider) {
      switch (granularity) {
        case 'coordinates':
          enriched = await enrichFromCoordinatesExternal(enriched, provider);
          break;
        case 'address':
          enriched = await enrichFromAddress(enriched, provider);
          break;
        default:
          break;
      }
    }
  } catch (err) {
    if (err instanceof OceanCoordinateError) throw err;
    console.error('Location enrichment failed, proceeding without enrichment:', err);
  }

  return computeDisplayCoordinates(enriched);
}

async function computeDisplayCoordinates(input: ListingInput): Promise<ListingInsertRow> {
  const granularity = input.location_granularity;

  // Exact coordinate modes: display = exact coords
  if (granularity === 'coordinates' || granularity === 'address') {
    if (input.latitude != null && input.longitude != null) {
      return { ...input, display_latitude: input.latitude, display_longitude: input.longitude };
    }
  }

  // Admin level modes: display = random point in most granular polygon
  const adminLevels: Array<{ level: number; name: string | null | undefined }> = [
    { level: 4, name: input.admin_level_4 },
    { level: 3, name: input.admin_level_3 },
    { level: 2, name: input.admin_level_2 },
    { level: 1, name: input.admin_level_1 },
  ];

  for (const { level, name } of adminLevels) {
    if (name) {
      try {
        const point = await getRandomPointInRegion(input.country_code, level, name);
        if (point) {
          return { ...input, display_latitude: point.lat, display_longitude: point.lng };
        }
      } catch {
        // Continue to next level if this one fails
      }
    }
  }

  // Fallback: if we have any coords at all, use them
  if (input.latitude != null && input.longitude != null) {
    return { ...input, display_latitude: input.latitude, display_longitude: input.longitude };
  }

  throw new DisplayCoordinateError(input.listing_id, granularity);
}

export class OceanCoordinateError extends Error {
  constructor(
    public readonly listingId: string,
    public readonly lat: number,
    public readonly lng: number,
  ) {
    super(
      `Coordinates (${lat}, ${lng}) for listing ${listingId} appear to be in the ocean — ` +
      'no admin region found within 10km. Verify your latitude and longitude are correct.',
    );
    this.name = 'OceanCoordinateError';
  }
}

export class DisplayCoordinateError extends Error {
  constructor(
    public readonly listingId: string,
    public readonly granularity: string,
  ) {
    super(
      `Cannot compute display coordinates for listing ${listingId} ` +
      `(granularity: ${granularity}). Ensure coordinates or admin levels are provided.`,
    );
    this.name = 'DisplayCoordinateError';
  }
}

/** Backfill admin levels from coordinates using our own PostGIS polygon data */
async function enrichFromPostGIS(input: ListingInput): Promise<ListingInput> {
  if (!input.latitude || !input.longitude || !input.country_code) return input;

  const postgisResult = await reverseGeocodePostGIS(input.country_code, input.latitude, input.longitude);
  if (postgisResult) {
    return {
      ...input,
      admin_level_1: input.admin_level_1 ?? postgisResult.admin_level_1 ?? null,
      admin_level_2: input.admin_level_2 ?? postgisResult.admin_level_2 ?? null,
      admin_level_3: input.admin_level_3 ?? postgisResult.admin_level_3 ?? null,
    };
  }

  // PostGIS returned null — check if this country has polygon data
  // If it does and no region matched, the coordinates are likely in the ocean
  const config = await getAdminLevelConfig(input.country_code);
  if (config) {
    throw new OceanCoordinateError(input.listing_id, input.latitude, input.longitude);
  }

  return input;
}

/** Fill remaining gaps via external geocoding provider (Mapbox) */
async function enrichFromCoordinatesExternal(
  input: ListingInput,
  provider: { reverseGeocode: (lat: number, lng: number) => Promise<GeocodingResult | null> },
): Promise<ListingInput> {
  if (!input.latitude || !input.longitude) return input;

  const result = await provider.reverseGeocode(input.latitude, input.longitude);
  if (!result) return input;

  return applyEnrichment(input, result);
}

async function enrichFromAddress(
  input: ListingInput,
  provider: {
    forwardGeocode: (address: string, countryCode: string) => Promise<GeocodingResult | null>;
    reverseGeocode: (lat: number, lng: number) => Promise<GeocodingResult | null>;
  },
): Promise<ListingInput> {
  if (!input.address_line_1) return input;

  // Forward geocode the address to get coordinates
  const addressParts = [input.address_line_1, input.admin_level_3, input.country_code].filter(Boolean);
  const forwardResult = await provider.forwardGeocode(addressParts.join(', '), input.country_code);
  if (!forwardResult) return input;

  // Set coordinates from forward geocoding
  const enriched = {
    ...input,
    latitude: input.latitude ?? forwardResult.latitude,
    longitude: input.longitude ?? forwardResult.longitude,
  };

  // Reverse geocode to fill admin levels
  const reverseResult = await provider.reverseGeocode(forwardResult.latitude, forwardResult.longitude);
  if (!reverseResult) return enriched;

  return applyEnrichment(enriched, reverseResult);
}

/** Apply geocoding results to fill empty admin level fields */
function applyEnrichment(input: ListingInput, geo: GeocodingResult): ListingInput {
  return {
    ...input,
    admin_level_1: input.admin_level_1 ?? geo.admin_level_1 ?? null,
    admin_level_2: input.admin_level_2 ?? geo.admin_level_2 ?? null,
    admin_level_3: input.admin_level_3 ?? geo.admin_level_3 ?? null,
    admin_level_4: input.admin_level_4 ?? geo.admin_level_4 ?? null,
    postal_code: input.postal_code ?? geo.postal_code ?? null,
  };
}
