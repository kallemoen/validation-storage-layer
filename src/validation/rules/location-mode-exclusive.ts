import type { ValidationRule, ValidationIssue } from '../../types/validation.js';

const COORD_GRANULARITIES = ['coordinates', 'address'];
const ADMIN_LEVEL_FIELDS = ['admin_level_1', 'admin_level_2', 'admin_level_3', 'admin_level_4'];

function hasCoords(input: Record<string, unknown>): boolean {
  return (typeof input.latitude === 'number') || (typeof input.longitude === 'number');
}

function hasAdminLevels(input: Record<string, unknown>): boolean {
  return ADMIN_LEVEL_FIELDS.some(
    (f) => input[f] !== null && input[f] !== undefined && input[f] !== '',
  );
}

export const locationModeExclusive: ValidationRule = {
  name: 'location_mode_exclusive',
  check(input) {
    const granularity = input.location_granularity as string;
    if (!granularity) return [];

    const issues: ValidationIssue[] = [];

    if (COORD_GRANULARITIES.includes(granularity) && hasAdminLevels(input)) {
      issues.push({
        field: 'location_granularity',
        rule: 'location_mode_exclusive',
        value: granularity,
        detail:
          `location_granularity "${granularity}" uses coordinate mode. ` +
          'Do not send admin_level_* fields — the system backfills admin levels from your coordinates via PostGIS. ' +
          'If you want to provide admin levels directly, set location_granularity to "admin_level_1" through "admin_level_4" and omit latitude/longitude.',
      });
    }

    if (!COORD_GRANULARITIES.includes(granularity) && hasCoords(input)) {
      issues.push({
        field: 'location_granularity',
        rule: 'location_mode_exclusive',
        value: granularity,
        detail:
          `location_granularity "${granularity}" uses admin-level mode. ` +
          'Do not send latitude/longitude — the system generates display coordinates from the region polygon. ' +
          'If you have precise coordinates, set location_granularity to "coordinates" or "address" and omit admin_level_* fields.',
      });
    }

    return issues;
  },
};
