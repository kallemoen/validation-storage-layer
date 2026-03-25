export interface PriceRange {
  min: number; // In minor units
  max: number;
}

/**
 * Price ranges keyed by "{country}:{listing_type}:{rent_period?}:{currency}".
 * For sales: "{country}:sale:{currency}"
 * For rentals: "{country}:rent:{rent_period}:{currency}"
 *
 * All values in minor units (e.g., EUR cents).
 */
export const PRICE_RANGES: Record<string, PriceRange> = {
  // Portugal
  'PT:sale:EUR':           { min: 1_000_00, max: 50_000_000_00 },  // 1,000 - 50,000,000 EUR
  'PT:rent:monthly:EUR':   { min: 100_00, max: 50_000_00 },        // 100 - 50,000 EUR/month
  'PT:rent:weekly:EUR':    { min: 50_00, max: 20_000_00 },          // 50 - 20,000 EUR/week
  'PT:rent:daily:EUR':     { min: 10_00, max: 5_000_00 },           // 10 - 5,000 EUR/day

  // Spain
  'ES:sale:EUR':           { min: 1_000_00, max: 100_000_000_00 },
  'ES:rent:monthly:EUR':   { min: 100_00, max: 50_000_00 },

  // France
  'FR:sale:EUR':           { min: 1_000_00, max: 100_000_000_00 },
  'FR:rent:monthly:EUR':   { min: 100_00, max: 100_000_00 },

  // UK
  'GB:sale:GBP':           { min: 1_000_00, max: 100_000_000_00 },
  'GB:rent:monthly:GBP':   { min: 100_00, max: 100_000_00 },

  // US
  'US:sale:USD':           { min: 1_000_00, max: 1_000_000_000_00 },
  'US:rent:monthly:USD':   { min: 100_00, max: 100_000_00 },

  // Brazil
  'BR:sale:BRL':           { min: 10_000_00, max: 500_000_000_00 },
  'BR:rent:monthly:BRL':   { min: 200_00, max: 500_000_00 },

  // UAE
  'AE:sale:AED':           { min: 10_000_00, max: 500_000_000_00 },
  'AE:rent:monthly:AED':   { min: 500_00, max: 1_000_000_00 },
};

export function getPriceRangeKey(
  countryCode: string,
  listingType: string,
  rentPeriod: string | null | undefined,
  currencyCode: string,
): string {
  if (listingType === 'rent' && rentPeriod) {
    return `${countryCode}:rent:${rentPeriod}:${currencyCode}`;
  }
  return `${countryCode}:${listingType}:${currencyCode}`;
}

export function getPriceRange(key: string): PriceRange | undefined {
  return PRICE_RANGES[key];
}
