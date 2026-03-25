export const VALID_LISTING_TYPES = new Set(['sale', 'rent']);
export const VALID_RENT_PERIODS = new Set(['monthly', 'weekly', 'daily']);
export const VALID_LISTING_STATUSES = new Set(['active', 'sold', 'delisted', 'expired']);
export const VALID_PROPERTY_TYPES = new Set([
  'house', 'apartment', 'land', 'commercial', 'mixed_use', 'parking', 'other',
]);
export const VALID_LOCATION_GRANULARITIES = new Set([
  'coordinates', 'address', 'postal_code',
  'admin_level_4', 'admin_level_3', 'admin_level_2',
  'admin_level_1', 'country',
]);

export const ENUM_FIELDS: Record<string, Set<string>> = {
  listing_type: VALID_LISTING_TYPES,
  rent_period: VALID_RENT_PERIODS,
  listing_status: VALID_LISTING_STATUSES,
  property_type: VALID_PROPERTY_TYPES,
  location_granularity: VALID_LOCATION_GRANULARITIES,
};
