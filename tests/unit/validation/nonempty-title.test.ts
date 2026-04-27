import { describe, it, expect } from 'vitest';
import { nonemptyTitle } from '../../../src/validation/rules/nonempty-title.js';
import { makeValidListing, makeValidContext } from '../../fixtures/valid-listing.js';

describe('nonempty_title', () => {
  const ctx = makeValidContext();

  it('passes for a normal title', () => {
    const listing = makeValidListing({ title: 'T2 in Belém' });
    expect(nonemptyTitle.check(listing, ctx)).toEqual([]);
  });

  it('rejects an empty string', () => {
    const listing = makeValidListing({ title: '' });
    const issues = nonemptyTitle.check(listing, ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ field: 'title', rule: 'nonempty_title', value: '' });
  });

  it('rejects whitespace-only', () => {
    const listing = makeValidListing({ title: '   ' });
    const issues = nonemptyTitle.check(listing, ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0].rule).toBe('nonempty_title');
  });

  it('skips when title is missing (handled by required_field)', () => {
    const listing = makeValidListing({ title: null as unknown as string });
    expect(nonemptyTitle.check(listing, ctx)).toEqual([]);
  });
});
