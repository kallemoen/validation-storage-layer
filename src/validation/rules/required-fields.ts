import type { ValidationRule, ValidationIssue } from '../../types/validation.js';

const REQUIRED_FIELDS = [
  'listing_id',
  'source_url',
  'config_id',
  'listing_type',
  'country_code',
  'property_type',
  'display_latitude',
  'display_longitude',
  'location_granularity',
  'raw_data',
];

export const requiredFields: ValidationRule = {
  name: 'required_field',
  check(input) {
    const issues: ValidationIssue[] = [];
    for (const field of REQUIRED_FIELDS) {
      if (input[field] === undefined || input[field] === null) {
        issues.push({ field, rule: 'required_field', value: input[field] ?? null });
      }
    }
    return issues;
  },
};
