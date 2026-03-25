import type { ValidationRule, ValidationIssue } from '../../types/validation.js';

const ROOM_FIELDS = [
  { field: 'bedrooms', min: 0, max: 50 },
  { field: 'bathrooms', min: 0, max: 50 },
];

export const roomRanges: ValidationRule = {
  name: 'room_range',
  check(input) {
    const issues: ValidationIssue[] = [];
    for (const { field, min, max } of ROOM_FIELDS) {
      const value = input[field];
      if (value === null || value === undefined) continue;
      if (typeof value === 'number' && (value < min || value > max)) {
        issues.push({ field, rule: 'room_range', value, expected: `${min}-${max}` });
      }
    }
    return issues;
  },
};
