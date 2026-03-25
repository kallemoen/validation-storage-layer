import type { ValidationRule } from '../../types/validation.js';

export const areaRange: ValidationRule = {
  name: 'area_range',
  check(input) {
    const value = input.living_area_sqm;
    if (value === null || value === undefined || typeof value !== 'number') return [];
    if (value < 5 || value > 50_000) {
      return [{ field: 'living_area_sqm', rule: 'area_range', value, expected: '5-50000 sqm' }];
    }
    return [];
  },
};
