import type { ValidationRule, ValidationIssue } from '../../types/validation.js';

/** Expected types for each field. Only checks fields that are present and non-null. */
const FIELD_TYPES: Record<string, 'string' | 'number' | 'integer' | 'object' | 'array'> = {
  listing_id: 'string',
  source_url: 'string',
  config_id: 'string',
  listing_type: 'string',
  rent_period: 'string',
  country_code: 'string',
  admin_level_1: 'string',
  admin_level_2: 'string',
  admin_level_3: 'string',
  admin_level_4: 'string',
  postal_code: 'string',
  address_line_1: 'string',
  address_line_2: 'string',
  latitude: 'number',
  longitude: 'number',
  display_latitude: 'number',
  display_longitude: 'number',
  location_granularity: 'string',
  price_amount: 'integer',
  price_currency_code: 'string',
  price_scraped_at: 'string',
  bedrooms: 'integer',
  bathrooms: 'number',
  total_rooms: 'integer',
  living_area_sqm: 'number',
  plot_area_sqm: 'number',
  raw_room_description: 'string',
  property_type: 'string',
  property_subtype: 'string',
  raw_property_type: 'string',
  description: 'string',
  images: 'array',
  raw_data: 'object',
};

function checkType(value: unknown, expected: string): boolean {
  switch (expected) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && !Number.isNaN(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
    default:
      return true;
  }
}

export const validTypes: ValidationRule = {
  name: 'valid_type',
  check(input) {
    const issues: ValidationIssue[] = [];
    for (const [field, expectedType] of Object.entries(FIELD_TYPES)) {
      const value = input[field];
      if (value === null || value === undefined) continue;
      if (!checkType(value, expectedType)) {
        issues.push({
          field,
          rule: 'valid_type',
          value,
          expected: expectedType,
        });
      }
    }
    return issues;
  },
};
