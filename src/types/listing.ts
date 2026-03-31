import { z } from 'zod';

export const LISTING_TYPES = ['sale', 'rent'] as const;
export const RENT_PERIODS = ['monthly', 'weekly', 'daily'] as const;
export const LISTING_STATUSES = ['active', 'sold', 'delisted', 'expired'] as const;
export const PROPERTY_TYPES = ['house', 'apartment', 'land', 'commercial', 'mixed_use', 'parking', 'other'] as const;
export const LOCATION_GRANULARITIES = [
  'coordinates', 'address', 'postal_code',
  'admin_level_4', 'admin_level_3', 'admin_level_2',
  'admin_level_1', 'country',
] as const;

export type ListingType = (typeof LISTING_TYPES)[number];
export type RentPeriod = (typeof RENT_PERIODS)[number];
export type ListingStatus = (typeof LISTING_STATUSES)[number];
export type PropertyType = (typeof PROPERTY_TYPES)[number];
export type LocationGranularity = (typeof LOCATION_GRANULARITIES)[number];

export const ListingInputSchema = z.object({
  listing_id: z.string().uuid(),
  source_url: z.string().url().max(2000),
  config_id: z.string().uuid(),
  listing_type: z.enum(LISTING_TYPES),
  rent_period: z.enum(RENT_PERIODS).nullable().optional(),
  country_code: z.string().length(2),
  admin_level_1: z.string().max(255).nullable().optional(),
  admin_level_2: z.string().max(255).nullable().optional(),
  admin_level_3: z.string().max(255).nullable().optional(),
  admin_level_4: z.string().max(255).nullable().optional(),
  postal_code: z.string().max(20).nullable().optional(),
  address_line_1: z.string().max(500).nullable().optional(),
  address_line_2: z.string().max(500).nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  location_granularity: z.enum(LOCATION_GRANULARITIES),
  price_amount: z.number().int().nullable().optional(),
  price_currency_code: z.string().length(3).nullable().optional(),
  price_scraped_at: z.string().datetime().nullable().optional(),
  bedrooms: z.number().int().nullable().optional(),
  bathrooms: z.number().nullable().optional(),
  total_rooms: z.number().int().nullable().optional(),
  living_area_sqm: z.number().nullable().optional(),
  plot_area_sqm: z.number().nullable().optional(),
  raw_room_description: z.string().max(500).nullable().optional(),
  property_type: z.enum(PROPERTY_TYPES),
  property_subtype: z.string().max(100).nullable().optional(),
  raw_property_type: z.string().max(500).nullable().optional(),
  title: z.string().min(1).max(500),
  description: z.string().nullable().optional(),
  images: z.array(z.string().url()).nullable().optional(),
  features: z.array(z.string()).nullable().optional(),
  raw_data: z.record(z.unknown()),
});

export type ListingInput = z.infer<typeof ListingInputSchema>;

export interface ListingInsertRow extends ListingInput {
  display_latitude: number;
  display_longitude: number;
}

export interface ListingRow extends ListingInsertRow {
  listing_status: ListingStatus;
  price_history: PriceHistoryEntry[];
  created_at: string;
  updated_at: string;
}

export interface PriceHistoryEntry {
  amount: number;
  currency_code: string;
  scraped_at: string;
}
