import { describe, it, expect } from 'vitest';
import { locationModeExclusive } from '../../../src/validation/rules/location-mode-exclusive.js';
import { makeValidListing, makeValidContext } from '../../fixtures/valid-listing.js';

describe('location_mode_exclusive', () => {
  const ctx = makeValidContext();

  it('passes for coordinate mode with no admin levels', () => {
    const listing = makeValidListing({
      location_granularity: 'coordinates',
      latitude: 38.7174,
      longitude: -9.1453,
      admin_level_1: null,
      admin_level_2: null,
      admin_level_3: null,
      admin_level_4: null,
    });
    expect(locationModeExclusive.check(listing, ctx)).toEqual([]);
  });

  it('rejects coordinate mode when admin levels are sent', () => {
    const listing = makeValidListing({
      location_granularity: 'coordinates',
      latitude: 38.7174,
      longitude: -9.1453,
      admin_level_1: 'Lisboa',
    });
    const issues = locationModeExclusive.check(listing, ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0].rule).toBe('location_mode_exclusive');
    expect(issues[0].detail).toContain('coordinate mode');
  });

  it('rejects address mode when admin levels are sent', () => {
    const listing = makeValidListing({
      location_granularity: 'address',
      admin_level_3: 'Santa Maria Maior',
    });
    const issues = locationModeExclusive.check(listing, ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0].rule).toBe('location_mode_exclusive');
  });

  it('passes for admin level mode with no coordinates', () => {
    const listing = makeValidListing({
      location_granularity: 'admin_level_3',
      latitude: null,
      longitude: null,
      admin_level_1: 'Lisboa',
      admin_level_2: 'Lisboa',
      admin_level_3: 'Santa Maria Maior',
    });
    expect(locationModeExclusive.check(listing, ctx)).toEqual([]);
  });

  it('rejects admin level mode when coordinates are sent', () => {
    const listing = makeValidListing({
      location_granularity: 'admin_level_3',
      latitude: 38.7174,
      longitude: -9.1453,
      admin_level_3: 'Santa Maria Maior',
    });
    const issues = locationModeExclusive.check(listing, ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0].rule).toBe('location_mode_exclusive');
    expect(issues[0].detail).toContain('admin-level mode');
  });

  it('rejects postal_code mode when coordinates are sent', () => {
    const listing = makeValidListing({
      location_granularity: 'postal_code',
      latitude: 38.7174,
      longitude: -9.1453,
    });
    const issues = locationModeExclusive.check(listing, ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0].rule).toBe('location_mode_exclusive');
  });

  it('rejects country mode when coordinates are sent', () => {
    const listing = makeValidListing({
      location_granularity: 'country',
      latitude: 38.7174,
      longitude: -9.1453,
    });
    const issues = locationModeExclusive.check(listing, ctx);
    expect(issues).toHaveLength(1);
  });

  it('passes coordinate mode when admin levels are all null', () => {
    const listing = makeValidListing({
      location_granularity: 'coordinates',
      latitude: 38.7174,
      longitude: -9.1453,
      admin_level_1: null,
      admin_level_2: null,
      admin_level_3: null,
      admin_level_4: null,
    });
    expect(locationModeExclusive.check(listing, ctx)).toEqual([]);
  });
});
