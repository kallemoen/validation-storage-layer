import type { ValidationRule, ValidationIssue } from '../../types/validation.js';

export const minimumCompleteness: ValidationRule = {
  name: 'minimum_completeness',
  check(input) {
    const fields = ['price_amount', 'bedrooms', 'living_area_sqm', 'description', 'images'];
    const populated = fields.filter(f => {
      const val = input[f];
      if (val === null || val === undefined) return false;
      if (Array.isArray(val)) return val.length > 0;
      if (typeof val === 'string') return val.length > 0;
      return true;
    });
    if (populated.length < 3) {
      return [{
        field: 'multiple',
        rule: 'minimum_completeness',
        value: populated.length,
        detail: `Only ${populated.length} of 5 key fields populated (${populated.join(', ')}). Recommend at least 3.`,
      }];
    }
    return [];
  },
};

export const locationMinimum: ValidationRule = {
  name: 'location_minimum',
  check(input) {
    if (!input.admin_level_3) {
      return [{
        field: 'admin_level_3',
        rule: 'location_minimum',
        value: null,
        detail: 'City-level location data (admin_level_3) recommended.',
      }];
    }
    return [];
  },
};

export const hasImages: ValidationRule = {
  name: 'has_images',
  check(input) {
    const images = input.images;
    if (!Array.isArray(images) || images.length === 0) {
      return [{
        field: 'images',
        rule: 'has_images',
        value: images ?? null,
        detail: 'Listing has no images.',
      }];
    }
    return [];
  },
};

export const hasDescription: ValidationRule = {
  name: 'has_description',
  check(input) {
    const desc = input.description;
    if (!desc || (typeof desc === 'string' && desc.trim().length === 0)) {
      return [{
        field: 'description',
        rule: 'has_description',
        value: desc ?? null,
        detail: 'Listing has no description.',
      }];
    }
    return [];
  },
};

export const hasFeatures: ValidationRule = {
  name: 'has_features',
  check(input) {
    const features = input.features;
    if (!Array.isArray(features) || features.length === 0) {
      return [{
        field: 'features',
        rule: 'has_features',
        value: features ?? null,
        detail: 'Listings should include feature tags when available.',
      }];
    }
    return [];
  },
};
