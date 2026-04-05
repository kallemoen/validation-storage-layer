import { getSupabaseClient } from './client.js';

export async function executeReadonlyQuery(sql: string): Promise<unknown> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('execute_readonly_query', {
    query_text: sql,
  });

  if (error) throw new Error(`Query execution failed: ${error.message}`);
  return data;
}

export async function getTableSchema(): Promise<unknown> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('get_table_schema');

  if (error) throw new Error(`Schema fetch failed: ${error.message}`);
  return data;
}
