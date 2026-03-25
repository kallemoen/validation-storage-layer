import type { ValidationRule, ValidationIssue } from '../../types/validation.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_FIELDS = ['listing_id', 'config_id'];

export const validUuid: ValidationRule = {
  name: 'valid_uuid',
  check(input) {
    const issues: ValidationIssue[] = [];
    for (const field of UUID_FIELDS) {
      const value = input[field];
      if (typeof value === 'string' && !UUID_REGEX.test(value)) {
        issues.push({ field, rule: 'valid_uuid', value, expected: 'UUID format (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)' });
      }
    }
    return issues;
  },
};
