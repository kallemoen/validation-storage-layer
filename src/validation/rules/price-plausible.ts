import type { ValidationRule } from '../../types/validation.js';
import { getPriceRangeKey, getPriceRange } from '../config/price-ranges.js';

export const pricePlausible: ValidationRule = {
  name: 'price_plausible',
  check(input, context) {
    const amount = input.price_amount;
    if (amount === null || amount === undefined || typeof amount !== 'number') return [];

    const currency = input.price_currency_code;
    if (typeof currency !== 'string') return [];

    const countryCode = context.scraperConfig.country_code;
    const listingType = input.listing_type as string;
    const rentPeriod = input.rent_period as string | null | undefined;

    const key = getPriceRangeKey(countryCode, listingType, rentPeriod, currency);
    const range = getPriceRange(key);

    // If no range configured for this country/type/currency combo, skip check
    if (!range) return [];

    if (amount < range.min || amount > range.max) {
      return [{
        field: 'price_amount',
        rule: 'price_plausible',
        value: amount,
        expected: `${range.min}-${range.max} (minor units) for ${key}`,
      }];
    }

    return [];
  },
};
