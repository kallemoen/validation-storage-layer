import type { ValidationRule, ValidationIssue } from '../../types/validation.js';
import { getCountryBounds } from '../config/country-bounds.js';

function checkCoords(
  lat: unknown,
  lng: unknown,
  countryCode: string,
  latField: string,
  lngField: string,
): ValidationIssue[] {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return [];
  if (typeof lat !== 'number' || typeof lng !== 'number') return [];

  const bounds = getCountryBounds(countryCode);
  if (!bounds) return []; // No bounds configured, skip

  const issues: ValidationIssue[] = [];
  if (lat < bounds.minLat || lat > bounds.maxLat) {
    issues.push({
      field: latField,
      rule: 'coordinates_in_country',
      value: lat,
      expected: `${bounds.minLat}-${bounds.maxLat} for ${countryCode}`,
    });
  }
  if (lng < bounds.minLng || lng > bounds.maxLng) {
    issues.push({
      field: lngField,
      rule: 'coordinates_in_country',
      value: lng,
      expected: `${bounds.minLng}-${bounds.maxLng} for ${countryCode}`,
    });
  }
  return issues;
}

export const coordinatesInCountry: ValidationRule = {
  name: 'coordinates_in_country',
  check(input) {
    const countryCode = input.country_code as string;
    if (!countryCode) return [];
    return checkCoords(input.latitude, input.longitude, countryCode, 'latitude', 'longitude');
  },
};

export const displayCoordinatesInCountry: ValidationRule = {
  name: 'display_coordinates_in_country',
  check(input) {
    const countryCode = input.country_code as string;
    if (!countryCode) return [];
    return checkCoords(
      input.display_latitude, input.display_longitude,
      countryCode, 'display_latitude', 'display_longitude',
    );
  },
};
