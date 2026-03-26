import { z } from 'zod';

export const SCRAPER_STATUSES = ['active', 'paused', 'broken', 'testing', 'degraded'] as const;
export const RUN_STATUSES = ['success', 'partial', 'failure'] as const;

export type ScraperStatus = (typeof SCRAPER_STATUSES)[number];
export type RunStatus = (typeof RUN_STATUSES)[number];

export const ScraperRegistryInputSchema = z.object({
  agency_name: z.string().max(255),
  country_code: z.string().length(2),
  area_key: z.string().max(255),
  listing_type: z.enum(['sale', 'rent']),
  config: z.record(z.unknown()),
});

export type ScraperRegistryInput = z.infer<typeof ScraperRegistryInputSchema>;

export interface ScraperRow {
  config_id: string;
  agency_name: string;
  country_code: string;
  area_key: string;
  listing_type: string;
  status: ScraperStatus;
  created_at: string;
  last_run_at: string | null;
  last_run_status: RunStatus | null;
  last_run_listings: number | null;
  failure_count: number;
  broken_at: string | null;
  repair_count: number;
  config: Record<string, unknown>;
  acceptance_rate: number | null;
  last_batch_at: string | null;
  last_batch_submitted: number | null;
  last_batch_accepted: number | null;
  top_rejection_rule: string | null;
  degraded_at: string | null;
}
