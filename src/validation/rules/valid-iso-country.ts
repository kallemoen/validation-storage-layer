import type { ValidationRule } from '../../types/validation.js';
import { isValidCountryCode } from '../../lib/iso-countries.js';

export const validIsoCountry: ValidationRule = {
  name: 'valid_iso_country',
  check(input) {
    const value = input.country_code;
    if (typeof value === 'string' && !isValidCountryCode(value)) {
      return [{ field: 'country_code', rule: 'valid_iso_country', value, expected: 'Valid ISO 3166-1 alpha-2 code' }];
    }
    return [];
  },
};
