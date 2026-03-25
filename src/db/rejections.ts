import { getSupabaseClient } from './client.js';
import type { ValidationResult } from '../types/validation.js';

export async function storeRejection(
  configId: string,
  mode: 'test' | 'live',
  listingData: Record<string, unknown>,
  result: ValidationResult,
) {
  const client = getSupabaseClient();
  const { error } = await client.from('rejections').insert({
    config_id: configId,
    mode,
    listing_data: listingData,
    tier_1_errors: result.tier_1_errors,
    tier_2_errors: result.tier_2_errors,
    tier_3_warnings: result.tier_3_warnings,
  });

  if (error) throw new Error(`Failed to store rejection: ${error.message}`);
}

export async function queryRejections(filters: {
  config_id?: string;
  mode?: string;
  limit?: number;
  offset?: number;
}) {
  const client = getSupabaseClient();
  let query = client.from('rejections').select('*', { count: 'exact' });

  if (filters.config_id) query = query.eq('config_id', filters.config_id);
  if (filters.mode) query = query.eq('mode', filters.mode);

  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  query = query.range(offset, offset + limit - 1).order('created_at', { ascending: false });

  const { data, error, count } = await query;
  if (error) throw new Error(`Failed to query rejections: ${error.message}`);
  return { data: data ?? [], total: count ?? 0, limit, offset };
}

export async function getRejectionById(id: string) {
  const client = getSupabaseClient();
  const { data, error } = await client.from('rejections').select('*').eq('id', id).single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to get rejection: ${error.message}`);
  }
  return data;
}

export async function getRejectionSummary(filters: {
  config_id?: string;
  since?: string;
}) {
  const client = getSupabaseClient();
  let query = client.from('rejections').select('tier_1_errors, tier_2_errors, mode, config_id');

  if (filters.config_id) query = query.eq('config_id', filters.config_id);
  if (filters.since) query = query.gte('created_at', filters.since);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to get rejection summary: ${error.message}`);

  const rows = data ?? [];
  const total = rows.length;
  const byMode = { test: 0, live: 0 };
  const reasonCounts = new Map<string, number>();

  for (const row of rows) {
    if (row.mode === 'test') byMode.test++;
    else byMode.live++;

    const errors = [...(row.tier_1_errors as Array<{ rule: string }>), ...(row.tier_2_errors as Array<{ rule: string }>)];
    for (const err of errors) {
      reasonCounts.set(err.rule, (reasonCounts.get(err.rule) ?? 0) + 1);
    }
  }

  const topReasons = Array.from(reasonCounts.entries())
    .map(([rule, count]) => ({ rule, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return { total, by_mode: byMode, top_rejection_reasons: topReasons };
}
