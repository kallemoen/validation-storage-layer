import type { ValidationRule } from '../types/validation.js';
import { minimumCompleteness, locationMinimum, hasImages, hasDescription } from './rules/completeness.js';

export const tier3Rules: ValidationRule[] = [
  minimumCompleteness,
  locationMinimum,
  hasImages,
  hasDescription,
];
