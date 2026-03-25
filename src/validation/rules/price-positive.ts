import type { ValidationRule } from '../../types/validation.js';

export const pricePositive: ValidationRule = {
  name: 'price_positive',
  check(input) {
    const value = input.price_amount;
    if (value !== null && value !== undefined && typeof value === 'number' && value <= 0) {
      return [{ field: 'price_amount', rule: 'price_positive', value, expected: 'Greater than 0' }];
    }
    return [];
  },
};
