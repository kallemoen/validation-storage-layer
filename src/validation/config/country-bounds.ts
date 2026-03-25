export interface CountryBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/** Approximate bounding boxes per country. Add new countries as scrapers are built. */
export const COUNTRY_BOUNDS: Record<string, CountryBounds> = {
  PT: { minLat: 36.96, maxLat: 42.15, minLng: -9.50, maxLng: -6.19 },
  ES: { minLat: 35.95, maxLat: 43.79, minLng: -9.30, maxLng: 4.33 },
  FR: { minLat: 41.36, maxLat: 51.09, minLng: -5.14, maxLng: 9.56 },
  GB: { minLat: 49.96, maxLat: 58.64, minLng: -7.57, maxLng: 1.68 },
  DE: { minLat: 47.27, maxLat: 55.06, minLng: 5.87, maxLng: 15.04 },
  IT: { minLat: 36.65, maxLat: 47.09, minLng: 6.63, maxLng: 18.52 },
  US: { minLat: 24.52, maxLat: 49.38, minLng: -124.77, maxLng: -66.95 },
  BR: { minLat: -33.75, maxLat: 5.27, minLng: -73.99, maxLng: -34.79 },
  JP: { minLat: 24.40, maxLat: 45.52, minLng: 122.93, maxLng: 153.99 },
  AE: { minLat: 22.63, maxLat: 26.08, minLng: 51.58, maxLng: 56.38 },
  MA: { minLat: 27.67, maxLat: 35.92, minLng: -13.17, maxLng: -1.01 },
  NL: { minLat: 50.75, maxLat: 53.47, minLng: 3.36, maxLng: 7.21 },
  SE: { minLat: 55.34, maxLat: 69.06, minLng: 11.11, maxLng: 24.17 },
  NO: { minLat: 57.98, maxLat: 71.19, minLng: 4.65, maxLng: 31.17 },
  DK: { minLat: 54.56, maxLat: 57.75, minLng: 8.09, maxLng: 12.69 },
};

export function getCountryBounds(countryCode: string): CountryBounds | undefined {
  return COUNTRY_BOUNDS[countryCode.toUpperCase()];
}
