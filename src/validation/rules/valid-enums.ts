import type { ValidationRule, ValidationIssue } from '../../types/validation.js';
import { ENUM_FIELDS } from '../config/enums.js';

export const validEnums: ValidationRule = {
  name: 'valid_enum',
  check(input) {
    const issues: ValidationIssue[] = [];
    for (const [field, allowedValues] of Object.entries(ENUM_FIELDS)) {
      const value = input[field];
      // Skip null/undefined for nullable enum fields (rent_period, listing_status)
      if (value === null || value === undefined) continue;
      if (typeof value === 'string' && !allowedValues.has(value)) {
        issues.push({
          field,
          rule: 'valid_enum',
          value,
          expected: `One of: ${Array.from(allowedValues).join(', ')}`,
        });
      }
    }
    return issues;
  },
};
