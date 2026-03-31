import { describe, it, expect } from 'vitest';
import { validateListing, validateBatch } from '../../../src/validation/engine.js';
import { makeValidListing, makeValidContext } from '../../fixtures/valid-listing.js';

describe('validateListing', () => {
  const ctx = makeValidContext();

  it('accepts a fully valid listing', () => {
    const result = validateListing(makeValidListing(), ctx, 'test');
    expect(['accepted', 'accepted_with_warnings']).toContain(result.status);
    expect(result.tier_1_errors).toEqual([]);
    expect(result.tier_2_errors).toEqual([]);
    expect(result.mode).toBe('test');
  });

  it('accepts with warnings when completeness is low', () => {
    const listing = makeValidListing({
      description: null,
      images: null,
      bedrooms: null,
      living_area_sqm: null,
    });
    const result = validateListing(listing, ctx, 'live');
    expect(result.status).toBe('accepted_with_warnings');
    expect(result.tier_3_warnings.length).toBeGreaterThan(0);
  });

  it('rejects on tier 1 failure (missing required field)', () => {
    const listing = makeValidListing({ listing_id: null });
    const result = validateListing(listing, ctx, 'test');
    expect(result.status).toBe('rejected');
    expect(result.tier_1_errors.length).toBeGreaterThan(0);
    expect(result.tier_1_errors[0].rule).toBe('required_field');
    // Short-circuit: no tier 2 errors
    expect(result.tier_2_errors).toEqual([]);
  });

  it('rejects on missing title', () => {
    const listing = makeValidListing({ title: null });
    const result = validateListing(listing, ctx, 'test');
    expect(result.status).toBe('rejected');
    expect(result.tier_1_errors.some(e => e.rule === 'required_field' && e.field === 'title')).toBe(true);
  });

  it('rejects on tier 2 failure (negative price)', () => {
    const listing = makeValidListing({ price_amount: -100 });
    const result = validateListing(listing, ctx, 'test');
    expect(result.status).toBe('rejected');
    expect(result.tier_2_errors.some(e => e.rule === 'price_positive')).toBe(true);
  });

  it('rejects on tier 1 invalid UUID', () => {
    const listing = makeValidListing({ listing_id: 'not-a-uuid' });
    const result = validateListing(listing, ctx, 'test');
    expect(result.status).toBe('rejected');
    expect(result.tier_1_errors.some(e => e.rule === 'valid_uuid')).toBe(true);
  });

  it('rejects on invalid country code', () => {
    const listing = makeValidListing({ country_code: 'XX' });
    const result = validateListing(listing, ctx, 'test');
    expect(result.status).toBe('rejected');
    expect(result.tier_1_errors.some(e => e.rule === 'valid_iso_country')).toBe(true);
  });

  it('rejects on invalid enum value', () => {
    const listing = makeValidListing({ listing_type: 'lease' });
    const result = validateListing(listing, ctx, 'test');
    expect(result.status).toBe('rejected');
    expect(result.tier_1_errors.some(e => e.rule === 'valid_enum')).toBe(true);
  });

  it('rejects when rent_period missing for rental', () => {
    const listing = makeValidListing({ listing_type: 'rent', rent_period: null });
    const result = validateListing(listing, ctx, 'test');
    expect(result.status).toBe('rejected');
    expect(result.tier_1_errors.some(e => e.rule === 'rent_period_required')).toBe(true);
  });

  it('rejects when price_amount present but currency missing', () => {
    const listing = makeValidListing({ price_amount: 100000, price_currency_code: null });
    const result = validateListing(listing, ctx, 'test');
    expect(result.status).toBe('rejected');
    expect(result.tier_2_errors.some(e => e.rule === 'price_currency_pair')).toBe(true);
  });

  it('rejects coordinates outside country bounds', () => {
    const listing = makeValidListing({ latitude: 60.0, longitude: -9.0 }); // Way north of Portugal
    const result = validateListing(listing, ctx, 'test');
    expect(result.status).toBe('rejected');
    expect(result.tier_2_errors.some(e => e.rule === 'coordinates_in_country')).toBe(true);
  });

  it('rejects implausible price', () => {
    const listing = makeValidListing({ price_amount: 1 }); // 0.01 EUR — too low
    const result = validateListing(listing, ctx, 'test');
    expect(result.status).toBe('rejected');
    expect(result.tier_2_errors.some(e => e.rule === 'price_plausible')).toBe(true);
  });

  it('rejects wrong type for a field', () => {
    const listing = makeValidListing({ bedrooms: 'three' });
    const result = validateListing(listing, ctx, 'test');
    expect(result.status).toBe('rejected');
    expect(result.tier_1_errors.some(e => e.rule === 'valid_type')).toBe(true);
  });

  it('rejects invalid image URL', () => {
    const listing = makeValidListing({ images: ['not-a-url'] });
    const result = validateListing(listing, ctx, 'test');
    expect(result.status).toBe('rejected');
    expect(result.tier_1_errors.some(e => e.rule === 'valid_url')).toBe(true);
  });

  it('rejects bedrooms out of range', () => {
    const listing = makeValidListing({ bedrooms: 100 });
    const result = validateListing(listing, ctx, 'test');
    expect(result.status).toBe('rejected');
    expect(result.tier_2_errors.some(e => e.rule === 'room_range')).toBe(true);
  });

  it('rejects area out of range', () => {
    const listing = makeValidListing({ living_area_sqm: 100000 });
    const result = validateListing(listing, ctx, 'test');
    expect(result.status).toBe('rejected');
    expect(result.tier_2_errors.some(e => e.rule === 'area_range')).toBe(true);
  });

  it('accepts listing with features and no has_features warning', () => {
    const listing = makeValidListing({ features: ['garage', 'pool'] });
    const result = validateListing(listing, ctx, 'test');
    expect(result.tier_3_warnings.some(w => w.rule === 'has_features')).toBe(false);
  });

  it('warns when features is null', () => {
    const listing = makeValidListing({ features: null });
    const result = validateListing(listing, ctx, 'test');
    expect(result.tier_3_warnings.some(w => w.rule === 'has_features')).toBe(true);
  });

  it('warns when features is an empty array', () => {
    const listing = makeValidListing({ features: [] });
    const result = validateListing(listing, ctx, 'test');
    expect(result.tier_3_warnings.some(w => w.rule === 'has_features')).toBe(true);
  });

  it('warns when features is omitted', () => {
    const listing = makeValidListing();
    delete listing.features;
    const result = validateListing(listing, ctx, 'test');
    expect(result.tier_3_warnings.some(w => w.rule === 'has_features')).toBe(true);
  });

  it('rejects when features is wrong type', () => {
    const listing = makeValidListing({ features: 'garage' });
    const result = validateListing(listing, ctx, 'test');
    expect(result.status).toBe('rejected');
    expect(result.tier_1_errors.some(e => e.rule === 'valid_type' && e.field === 'features')).toBe(true);
  });
});

describe('validateBatch', () => {
  const ctx = makeValidContext();

  it('returns correct summary for mixed batch', () => {
    const listings = [
      makeValidListing(),
      makeValidListing({ listing_id: null }), // will fail tier 1
      makeValidListing({
        listing_id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
        description: null, images: null, bedrooms: null, living_area_sqm: null,
      }), // will pass with warnings
    ];

    const result = validateBatch(listings, ctx, 'test');

    expect(result.summary.total_submitted).toBe(3);
    expect(result.summary.accepted + result.summary.accepted_with_warnings).toBe(2);
    expect(result.summary.rejected).toBe(1);
    expect(result.results).toHaveLength(3);
  });

  it('computes top rejection reasons', () => {
    const listings = [
      makeValidListing({ listing_id: null }),
      makeValidListing({ listing_id: null, source_url: null }),
    ];

    const result = validateBatch(listings, ctx, 'test');
    expect(result.summary.top_rejection_reasons.length).toBeGreaterThan(0);
    expect(result.summary.top_rejection_reasons[0].rule).toBe('required_field');
  });
});
