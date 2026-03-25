import type { ValidationRule } from '../../types/validation.js';

export const countrySupported: ValidationRule = {
  name: 'country_supported',
  check(input, context) {
    const lookup = context.geographyLookup;
    if (!lookup || !lookup.isInitialized()) return []; // not wired up yet, skip

    const countryCode = input.country_code as string;
    if (!countryCode) return []; // caught by required_field rule

    if (!lookup.hasData(countryCode)) {
      const supported = lookup.supportedCountries().join(', ');
      return [{
        field: 'country_code',
        rule: 'country_supported',
        value: countryCode,
        expected: `Supported countries: ${supported}`,
        detail: `Country ${countryCode} is not yet supported. Listings can only be submitted for countries with geography data loaded.`,
      }];
    }

    return [];
  },
};
