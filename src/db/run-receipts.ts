import { getSupabaseClient } from './client.js';
import type { RunResultInput } from '../types/operations.js';

export async function storeRunReceipt(configId: string, input: RunResultInput) {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('run_receipts')
    .insert({
      config_id: configId,
      started_at: input.started_at,
      completed_at: input.completed_at,
      status: input.status,
      failure_stage: input.failure_stage ?? null,
      urls_discovered: input.urls_discovered ?? null,
      urls_new: input.urls_new ?? null,
      listings_extracted: input.listings_extracted ?? null,
      listings_submitted: input.listings_submitted ?? null,
      listings_accepted: input.listings_accepted ?? null,
      listings_rejected: input.listings_rejected ?? null,
      error_message: input.error_message ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to store run receipt: ${error.message}`);
  return data;
}

export async function queryRunReceipts(filters: {
  config_id?: string;
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const client = getSupabaseClient();
  let query = client.from('run_receipts').select('*', { count: 'exact' });

  if (filters.config_id) query = query.eq('config_id', filters.config_id);
  if (filters.status) query = query.eq('status', filters.status);

  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  query = query.range(offset, offset + limit - 1).order('started_at', { ascending: false });

  const { data, error, count } = await query;
  if (error) throw new Error(`Failed to query run receipts: ${error.message}`);
  return { data: data ?? [], total: count ?? 0, limit, offset };
}
