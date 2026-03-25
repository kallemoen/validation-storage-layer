import { describe, it, expect } from 'vitest';
import { countrySupported } from '../../../src/validation/rules/country-supported.js';
import { makeValidListing, makeValidContext } from '../../fixtures/valid-listing.js';

describe('country_supported', () => {
  const ctx = makeValidContext();

  it('passes for a PT listing (geography data loaded)', () => {
    const listing = makeValidListing();
    const issues = countrySupported.check(listing, ctx);
    expect(issues).toEqual([]);
  });

  it('rejects a US listing with country_supported error', () => {
    const listing = makeValidListing({ country_code: 'US' });
    const issues = countrySupported.check(listing, ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0].rule).toBe('country_supported');
    expect(issues[0].field).toBe('country_code');
    expect(issues[0].value).toBe('US');
    expect(issues[0].detail).toContain('not yet supported');
  });

  it('passes when geographyLookup is undefined (graceful skip)', () => {
    const ctxNoGeo = makeValidContext({ geographyLookup: undefined });
    const listing = makeValidListing({ country_code: 'US' });
    const issues = countrySupported.check(listing, ctxNoGeo);
    expect(issues).toEqual([]);
  });
});
