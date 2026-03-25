import type { ListingInput, LocationGranularity } from '../types/listing.js';
import type { GeocodingResult } from './geocoding.js';
import { getGeocodingProvider } from './geocoding.js';

/**
 * Enriches location data on a listing based on what's already provided.
 * Never fabricates data more granular than the source.
 * Non-blocking: if geocoding fails, returns the listing unchanged.
 */
export async function enrichLocation(input: ListingInput): Promise<ListingInput> {
  const provider = getGeocodingProvider();
  if (!provider) return input;

  const granularity = input.location_granularity;

  try {
    switch (granularity) {
      case 'coordinates':
        return await enrichFromCoordinates(input, provider);
      case 'address':
        return await enrichFromAddress(input, provider);
      default:
        // For postal_code, admin_level_*, and country — skip enrichment for now.
        // These would require boundary polygon data to enrich properly.
        return input;
    }
  } catch (err) {
    console.error('Location enrichment failed, proceeding without enrichment:', err);
    return input;
  }
}

async function enrichFromCoordinates(
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
