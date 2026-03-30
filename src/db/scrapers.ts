import { getSupabaseClient } from './client.js';
import type { ScraperRegistryInput, ScraperRow } from '../types/scraper.js';
import type { BatchSummary } from '../types/validation.js';
import { evaluateBatchHealth, evaluateRunHealth } from '../health/evaluate.js';

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
      expected_discovery_count: input.expected_discovery_count,
      run_interval_hours: input.run_interval_hours,
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
  },
) {
  const client = getSupabaseClient();
  const now = new Date().toISOString();

  const updates: Record<string, unknown> = {
    last_run_at: now,
    last_run_status: runResult.status,
    last_run_listings: runResult.listings_accepted ?? null,
  };

  const { error } = await client
    .from('scraper_registry')
    .update(updates)
    .eq('config_id', configId);

  if (error) throw new Error(`Failed to update scraper run result: ${error.message}`);
  return { updated: true };
}

export async function updateScraperStatus(configId: string, newStatus: string) {
  const client = getSupabaseClient();
  const existing = await getScraperById(configId);
  if (!existing) return null;

  const updates: Record<string, unknown> = {
    status: newStatus,
    status_reason: `Manually set to ${newStatus}`,
  };

  // Track repairs: if moving from broken/degraded/testing to active, increment repair_count
  if (newStatus === 'active' && (existing.status === 'broken' || existing.status === 'degraded' || existing.status === 'testing')) {
    updates.repair_count = existing.repair_count + 1;
    updates.failure_count = 0;
    updates.degraded_at = null;
  }

  const { error } = await client
    .from('scraper_registry')
    .update(updates)
    .eq('config_id', configId);

  if (error) throw new Error(`Failed to update scraper status: ${error.message}`);
  return { updated: true };
}

export async function updateScraperBatchHealth(
  configId: string,
  summary: BatchSummary,
  insertedCount: number,
) {
  const client = getSupabaseClient();
  const existing = await getScraperById(configId) as ScraperRow | null;
  if (!existing) return null;

  const totalAccepted = summary.accepted + summary.accepted_with_warnings;
  const rate = summary.total_submitted > 0
    ? totalAccepted / summary.total_submitted
    : 0;
  const topRule = summary.top_rejection_reasons[0]?.rule ?? null;
  const now = new Date().toISOString();

  // Evaluate health using pure function
  const result = evaluateBatchHealth({ scraper: existing, summary, insertedCount });

  const updates: Record<string, unknown> = {
    acceptance_rate: Math.round(rate * 1000) / 1000,
    last_batch_at: now,
    last_batch_submitted: summary.total_submitted,
    last_batch_accepted: totalAccepted,
    top_rejection_rule: topRule,
  };

  if (result.updateInsertTimestamp) {
    updates.last_successful_insert_at = now;
  }

  if (result.newStatus) {
    updates.status = result.newStatus;
    updates.status_reason = result.reason;

    if (result.newStatus === 'broken') {
      updates.broken_at = now;
      updates.degraded_at = existing.degraded_at ?? now;
    } else if (result.newStatus === 'degraded') {
      updates.degraded_at = now;
    } else if (result.newStatus === 'active') {
      updates.degraded_at = null;
    }
  } else if (result.reason) {
    // Status didn't change but we have a reason (e.g. already broken)
    updates.status_reason = result.reason;
  }

  const { error } = await client
    .from('scraper_registry')
    .update(updates)
    .eq('config_id', configId);

  if (error) throw new Error(`Failed to update scraper batch health: ${error.message}`);

  return {
    updated: true,
    acceptance_rate: Math.round(rate * 1000) / 1000,
    status: result.newStatus ?? existing.status,
    status_reason: result.reason,
    status_changed: result.newStatus !== null,
  };
}

export async function updateScraperRunHealth(
  configId: string,
  runData: {
    urls_discovered: number;
    urls_new: number;
    listings_submitted: number;
  },
) {
  const client = getSupabaseClient();
  const existing = await getScraperById(configId) as ScraperRow | null;
  if (!existing) return null;

  // Evaluate health using pure function
  const result = evaluateRunHealth({
    scraper: existing,
    urlsDiscovered: runData.urls_discovered,
    urlsNew: runData.urls_new,
    listingsSubmitted: runData.listings_submitted,
  });

  if (!result.newStatus && !result.reason) {
    return { updated: false, status: existing.status, status_reason: existing.status_reason, status_changed: false };
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {};

  if (result.newStatus) {
    updates.status = result.newStatus;
    updates.status_reason = result.reason;

    if (result.newStatus === 'broken') {
      updates.broken_at = now;
      updates.degraded_at = existing.degraded_at ?? now;
    } else if (result.newStatus === 'degraded') {
      updates.degraded_at = now;
    } else if (result.newStatus === 'active') {
      updates.degraded_at = null;
    }
  } else if (result.reason) {
    updates.status_reason = result.reason;
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await client
      .from('scraper_registry')
      .update(updates)
      .eq('config_id', configId);

    if (error) throw new Error(`Failed to update scraper run health: ${error.message}`);
  }

  return {
    updated: true,
    status: result.newStatus ?? existing.status,
    status_reason: result.reason,
    status_changed: result.newStatus !== null,
  };
}
