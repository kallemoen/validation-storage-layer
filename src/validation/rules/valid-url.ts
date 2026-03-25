import type { ValidationRule, ValidationIssue } from '../../types/validation.js';

function isValidUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export const validUrl: ValidationRule = {
  name: 'valid_url',
  check(input) {
    const issues: ValidationIssue[] = [];

    // Check source_url
    if (input.source_url !== null && input.source_url !== undefined) {
      if (!isValidUrl(input.source_url)) {
        issues.push({ field: 'source_url', rule: 'valid_url', value: input.source_url, expected: 'Valid URL' });
      }
    }

    // Check image URLs
    const images = input.images;
    if (Array.isArray(images)) {
      for (let i = 0; i < images.length; i++) {
        if (!isValidUrl(images[i])) {
          issues.push({
            field: `images[${i}]`,
            rule: 'valid_url',
            value: images[i],
            expected: 'Valid URL',
          });
        }
      }
    }

    return issues;
  },
};
