import type { ValidationContext } from '../../src/types/validation.js';
import { createGeographyLookup } from '../../src/validation/config/geography-lookup.js';
import type { AdminLevelConfig, AdminRegion } from '../../src/types/geography.js';

/** A fully valid Portuguese rental listing */
export function makeValidListing(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    listing_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    source_url: 'https://remax.pt/listing/12345',
    config_id: 'a9b8c7d6-e5f4-4a3b-8c2d-1e0f9a8b7c6d',
    listing_type: 'rent',
    rent_period: 'monthly',
    country_code: 'PT',
    admin_level_1: null,
    admin_level_2: null,
    admin_level_3: null,
    admin_level_4: null,
    postal_code: '1150-123',
    address_line_1: 'Rua da Alegria 45',
    address_line_2: '3o Andar',
    latitude: 38.7174,
    longitude: -9.1453,
    location_granularity: 'coordinates',
    price_amount: 170000, // 1700.00 EUR in cents
    price_currency_code: 'EUR',
    price_scraped_at: '2026-03-24T14:30:00Z',
    bedrooms: 2,
    bathrooms: 1,
    total_rooms: 3,
    living_area_sqm: 75.0,
    plot_area_sqm: null,
    raw_room_description: 'T2 - 2 quartos',
    property_type: 'apartment',
    property_subtype: null,
    raw_property_type: 'Apartamento T2',
    description: 'Apartamento T2, no Centro de Lisboa, totalmente renovado.',
    images: ['https://remax.pt/img/1.jpg', 'https://remax.pt/img/2.jpg'],
    raw_data: { price: '1 700 €/ Mensal', type: 'Apartamento T2' },
    ...overrides,
  };
}

/** A valid Portuguese sale listing */
export function makeValidSaleListing(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return makeValidListing({
    listing_type: 'sale',
    rent_period: null,
    price_amount: 35000000, // 350,000.00 EUR
    ...overrides,
  });
}

const ptConfig: AdminLevelConfig = {
  country_code: 'PT',
  level_1_label: 'Distrito',
  level_2_label: 'Concelho',
  level_3_label: 'Freguesia',
  level_4_label: null,
  max_level: 3,
};

const ptRegions: AdminRegion[] = [
  { id: 1, country_code: 'PT', level: 1, name: 'Lisboa', name_ascii: 'Lisboa', name_local: null, parent_id: null, external_id: null },
  { id: 2, country_code: 'PT', level: 2, name: 'Lisboa', name_ascii: 'Lisboa', name_local: null, parent_id: 1, external_id: null },
  { id: 3, country_code: 'PT', level: 3, name: 'Santa Maria Maior', name_ascii: 'Santa Maria Maior', name_local: null, parent_id: 2, external_id: null },
  { id: 4, country_code: 'PT', level: 3, name: 'Misericórdia', name_ascii: 'Misericordia', name_local: null, parent_id: 2, external_id: null },
];

export function makeValidContext(overrides: Partial<ValidationContext> = {}): ValidationContext {
  return {
    scraperConfig: {
      config_id: 'a9b8c7d6-e5f4-4a3b-8c2d-1e0f9a8b7c6d',
      country_code: 'PT',
      listing_type: 'rent',
      config: { currency_code: 'EUR' },
    },
    countryBounds: {
      PT: { minLat: 36.96, maxLat: 42.15, minLng: -9.50, maxLng: -6.19 },
    },
    priceRanges: {
      'PT:rent:monthly:EUR': { min: 10000, max: 5000000 },
      'PT:sale:EUR': { min: 100000, max: 5000000000 },
    },
    geographyLookup: createGeographyLookup([ptConfig], ptRegions),
    ...overrides,
  };
}
