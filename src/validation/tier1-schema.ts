import type { ValidationRule } from '../types/validation.js';
import { requiredFields } from './rules/required-fields.js';
import { validUuid } from './rules/valid-uuid.js';
import { validIsoCountry } from './rules/valid-iso-country.js';
import { validEnums } from './rules/valid-enums.js';
import { validTypes } from './rules/valid-types.js';
import { validUrl } from './rules/valid-url.js';
import { rentPeriodRequired } from './rules/rent-period-required.js';
import { nonemptyTitle } from './rules/nonempty-title.js';

export const tier1Rules: ValidationRule[] = [
  requiredFields,
  validUuid,
  validIsoCountry,
  validEnums,
  validTypes,
  validUrl,
  rentPeriodRequired,
  nonemptyTitle,
];
