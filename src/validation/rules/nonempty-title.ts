import type { ValidationRule, ValidationIssue } from '../../types/validation.js';

/**
 * Reject titles that are empty or whitespace-only.
 * `requiredFields` only catches null/undefined; this catches `""` and `"   "`.
 * Mirrors the DB-level `listings_title_nonempty` CHECK constraint.
 */
export const nonemptyTitle: ValidationRule = {
  name: 'nonempty_title',
  check(input) {
    const issues: ValidationIssue[] = [];
    const value = input.title;
    if (typeof value === 'string' && value.trim().length === 0) {
      issues.push({ field: 'title', rule: 'nonempty_title', value });
    }
    return issues;
  },
};
