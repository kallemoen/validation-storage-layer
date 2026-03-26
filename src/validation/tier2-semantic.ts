import type { ValidationRule } from '../types/validation.js';
import { pricePositive } from './rules/price-positive.js';
import { pricePlausible } from './rules/price-plausible.js';
import { currencyMatchesConfig } from './rules/currency-matches-config.js';
import { roomRanges } from './rules/room-ranges.js';
import { areaRange } from './rules/area-range.js';
import { coordinatesInCountry } from './rules/coordinates-in-country.js';
import { priceCurrencyPair } from './rules/price-currency-pair.js';
import { countrySupported } from './rules/country-supported.js';
import { adminLevelsValid } from './rules/admin-levels-valid.js';
import { locationModeExclusive } from './rules/location-mode-exclusive.js';

export const tier2Rules: ValidationRule[] = [
  countrySupported,
  locationModeExclusive,
  pricePositive,
  pricePlausible,
  currencyMatchesConfig,
  roomRanges,
  areaRange,
  coordinatesInCountry,
  priceCurrencyPair,
  adminLevelsValid,
];
