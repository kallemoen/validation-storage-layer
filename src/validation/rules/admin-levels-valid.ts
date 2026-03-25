import type { ValidationRule, ValidationIssue } from '../../types/validation.js';

export const adminLevelsValid: ValidationRule = {
  name: 'admin_levels_valid',
  check(input, context) {
    const lookup = context.geographyLookup;
    if (!lookup) return [];

    const countryCode = input.country_code as string;
    if (!countryCode || !lookup.hasData(countryCode)) return [];

    const maxLevel = lookup.maxLevel(countryCode);
    const issues: ValidationIssue[] = [];

    for (let level = 1; level <= maxLevel; level++) {
      const value = input[`admin_level_${level}`] as string | null | undefined;
      if (!value) continue;

      const parentValue = level > 1
        ? (input[`admin_level_${level - 1}`] as string | null | undefined) ?? undefined
        : undefined;

      const exists = lookup.regionExists(countryCode, level, value, parentValue);
      if (!exists) {
        const label = lookup.levelLabel(countryCode, level) ?? `admin_level_${level}`;
        const suggestion = lookup.closestMatch(countryCode, level, value, parentValue);

        const parentLabel = parentValue
          ? ` in ${lookup.levelLabel(countryCode, level - 1) ?? `admin_level_${level - 1}`} "${parentValue}"`
          : '';

        issues.push({
          field: `admin_level_${level}`,
          rule: 'admin_levels_valid',
          value,
          expected: `Valid ${label} for ${countryCode}${parentLabel}`,
          detail: suggestion
            ? `"${value}" not found. Did you mean "${suggestion}"?`
            : `"${value}" not found in reference data for ${countryCode}.`,
        });
      }
    }

    return issues;
  },
};
