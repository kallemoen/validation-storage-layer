import { z } from 'zod';

// Price update
export const PriceUpdateSchema = z.object({
  price_amount: z.number().int(),
  price_currency_code: z.string().length(3),
});

export type PriceUpdateInput = z.infer<typeof PriceUpdateSchema>;

// Listing status update
export const StatusUpdateSchema = z.object({
  listing_status: z.enum(['active', 'sold', 'delisted', 'expired']),
});

export type StatusUpdateInput = z.infer<typeof StatusUpdateSchema>;

// Run result (from collection layer)
export const RunResultSchema = z.object({
  started_at: z.string().datetime(),
  completed_at: z.string().datetime(),
  status: z.enum(['success', 'partial', 'failure']),
  failure_stage: z.enum(['discovery', 'extraction', 'validation']).nullable().optional(),
  urls_discovered: z.number().int().optional(),
  urls_new: z.number().int().optional(),
  listings_extracted: z.number().int().optional(),
  listings_submitted: z.number().int().optional(),
  listings_accepted: z.number().int().optional(),
  listings_rejected: z.number().int().optional(),
  error_message: z.string().nullable().optional(),
});

export type RunResultInput = z.infer<typeof RunResultSchema>;

// Scraper status update
export const ScraperStatusUpdateSchema = z.object({
  status: z.enum(['active', 'paused', 'broken', 'testing']),
});

export type ScraperStatusUpdateInput = z.infer<typeof ScraperStatusUpdateSchema>;

// Rejection row
export interface RejectionRow {
  id: string;
  config_id: string;
  mode: 'test' | 'live';
  listing_data: Record<string, unknown>;
  tier_1_errors: Array<Record<string, unknown>>;
  tier_2_errors: Array<Record<string, unknown>>;
  tier_3_warnings: Array<Record<string, unknown>>;
  created_at: string;
}

// Run receipt row
export interface RunReceiptRow {
  id: string;
  config_id: string;
  started_at: string;
  completed_at: string;
  status: string;
  failure_stage: string | null;
  urls_discovered: number | null;
  urls_new: number | null;
  listings_extracted: number | null;
  listings_submitted: number | null;
  listings_accepted: number | null;
  listings_rejected: number | null;
  error_message: string | null;
}
