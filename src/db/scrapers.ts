import { getSupabaseClient } from './client.js';
import type { ScraperRegistryInput } from '../types/scraper.js';

export async function registerScraper(input: ScraperRegistryInput) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('scraper_registry')
    .insert({
      agency_name: input.agency_name,
      country_code: input.country_code,
      area_key: input.area_key,
      listing_type: input.listing_type,
      config: input.config,
      status: 'testing',
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to register scraper: ${error.message}`);
  return data;
}

export async function getScraperById(configId: string) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('scraper_registry')
    .select('*')
    .eq('config_id', configId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to get scraper: ${error.message}`);
  }
  return data;
}

export async function queryScrapers(filters: {
  status?: string;
  country_code?: string;
  listing_type?: string;
  limit?: number;
  offset?: number;
}) {
  const client = getSupabaseClient();
  let query = client.from('scraper_registry').select('*', { count: 'exact' });

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.country_code) query = query.eq('country_code', filters.country_code);
  if (filters.listing_type) query = query.eq('listing_type', filters.listing_type);

  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  query = query.range(offset, offset + limit - 1).order('created_at', { ascending: false });

  const { data, error, count } = await query;
  if (error) throw new Error(`Failed to query scrapers: ${error.message}`);
  return { data: data ?? [], total: count ?? 0, limit, offset };
}

export async function updateScraperRunResult(
  configId: string,
  runResult: {
    status: string;
    listings_accepted?: number;
    failure_count_action: 'increment' | 'reset';
  },
) {
  const client = getSupabaseClient();
  const now = new Date().toISOString();

  // Fetch current to handle failure_count logic
  const existing = await getScraperById(configId);
  if (!existing) return null;

  const newFailureCount = runResult.failure_count_action === 'reset' ? 0 : existing.failure_count + 1;
  const updates: Record<string, unknown> = {
    last_run_at: now,
    last_run_status: runResult.status,
    last_run_listings: runResult.listings_accepted ?? null,
    failure_count: newFailureCount,
  };

  // Auto-mark as broken after 3 consecutive failures
  if (newFailureCount >= 3 && existing.status === 'active') {
    updates.status = 'broken';
    updates.broken_at = now;
  }

  const { error } = await client
    .from('scraper_registry')
    .update(updates)
    .eq('config_id', configId);

  if (error) throw new Error(`Failed to update scraper run result: ${error.message}`);
  return { updated: true, failure_count: newFailureCount };
}

export async function updateScraperStatus(configId: string, newStatus: string) {
  const client = getSupabaseClient();
  const existing = await getScraperById(configId);
  if (!existing) return null;

  const updates: Record<string, unknown> = { status: newStatus };

  // Track repairs: if moving from broken/testing to active, increment repair_count
  if (newStatus === 'active' && (existing.status === 'broken' || existing.status === 'testing')) {
    updates.repair_count = existing.repair_count + 1;
    updates.failure_count = 0;
  }

  const { error } = await client
    .from('scraper_registry')
    .update(updates)
    .eq('config_id', configId);

  if (error) throw new Error(`Failed to update scraper status: ${error.message}`);
  return { updated: true };
}
