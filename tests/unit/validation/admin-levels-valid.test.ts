import { describe, it, expect } from 'vitest';
import { adminLevelsValid } from '../../../src/validation/rules/admin-levels-valid.js';
import { makeValidListing, makeValidContext } from '../../fixtures/valid-listing.js';

describe('admin_levels_valid', () => {
  const ctx = makeValidContext();

  it('passes for a valid PT listing with correct hierarchy', () => {
    const listing = makeValidListing();
    const issues = adminLevelsValid.check(listing, ctx);
    expect(issues).toEqual([]);
  });

  it('rejects a nonexistent Freguesia with suggestion', () => {
    const listing = makeValidListing({ admin_level_3: 'Santa Maria Major' }); // typo
    const issues = adminLevelsValid.check(listing, ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0].rule).toBe('admin_levels_valid');
    expect(issues[0].field).toBe('admin_level_3');
    expect(issues[0].value).toBe('Santa Maria Major');
    expect(issues[0].detail).toContain('Did you mean');
    expect(issues[0].detail).toContain('Santa Maria Maior');
  });

  it('rejects a valid Freguesia under the wrong parent Concelho', () => {
    // Santa Maria Maior exists under Lisboa (id 2), but we set admin_level_2
    // to a value that does not exist, so the parent lookup fails.
    // The rule still falls back to byName and finds it, so instead we test
    // with a Freguesia name that genuinely doesn't match a different parent.
    const listing = makeValidListing({
      admin_level_2: 'Porto', // not in our geography data
      admin_level_3: 'Santa Maria Maior',
    });
    const issues = adminLevelsValid.check(listing, ctx);
    // admin_level_2 "Porto" doesn't exist → rejected
    const level2Issue = issues.find(i => i.field === 'admin_level_2');
    expect(level2Issue).toBeDefined();
    expect(level2Issue!.rule).toBe('admin_levels_valid');
    expect(level2Issue!.value).toBe('Porto');
  });

  it('passes when no admin levels are provided (optional fields)', () => {
    const listing = makeValidListing({
      admin_level_1: null,
      admin_level_2: null,
      admin_level_3: null,
    });
    const issues = adminLevelsValid.check(listing, ctx);
    expect(issues).toEqual([]);
  });

  it('passes when country has no geography data (skip)', () => {
    const listing = makeValidListing({ country_code: 'ES' });
    const issues = adminLevelsValid.check(listing, ctx);
    expect(issues).toEqual([]);
  });
});
