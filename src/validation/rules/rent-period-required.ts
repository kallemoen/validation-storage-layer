import type { ValidationRule } from '../../types/validation.js';

export const rentPeriodRequired: ValidationRule = {
  name: 'rent_period_required',
  check(input) {
    if (input.listing_type === 'rent' && (input.rent_period === null || input.rent_period === undefined)) {
      return [{
        field: 'rent_period',
        rule: 'rent_period_required',
        value: null,
        expected: 'One of: monthly, weekly, daily (required when listing_type is rent)',
      }];
    }
    return [];
  },
};
