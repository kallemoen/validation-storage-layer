import { getSupabaseClient } from './client.js';
import type { AdminRegion, AdminLevelConfig } from '../types/geography.js';

export async function getRegionsForCountry(countryCode: string): Promise<AdminRegion[]> {
  const client = getSupabaseClient();
  const allRegions: AdminRegion[] = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await client
      .from('admin_regions')
      .select('id, country_code, level, name, name_ascii, name_local, parent_id, external_id')
      .eq('country_code', countryCode)
      .order('level')
      .order('name')
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(`Failed to load admin regions: ${error.message}`);
    if (!data || data.length === 0) break;

    allRegions.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return allRegions;
}

export async function getAdminLevelConfig(countryCode: string): Promise<AdminLevelConfig | null> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('admin_level_config')
    .select('*')
    .eq('country_code', countryCode)
    .single();

  if (error?.code === 'PGRST116') return null; // not found
  if (error) throw new Error(`Failed to load admin level config: ${error.message}`);
  return data;
}

export async function getSupportedCountries(): Promise<AdminLevelConfig[]> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('admin_level_config')
    .select('*')
    .order('country_code');

  if (error) throw new Error(`Failed to load supported countries: ${error.message}`);
  return data ?? [];
}

export async function findRegionByPoint(
  countryCode: string,
  level: number,
  lat: number,
  lng: number,
): Promise<AdminRegion | null> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('find_admin_region_by_point', {
    p_country_code: countryCode,
    p_level: level,
    p_lat: lat,
    p_lng: lng,
  });

  if (error) throw new Error(`PostGIS lookup failed: ${error.message}`);
  if (!data || data.length === 0) return null;
  return data[0];
}

export async function getRandomPointInRegion(
  countryCode: string,
  level: number,
  name: string,
): Promise<{ lat: number; lng: number } | null> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc('random_point_in_region', {
    p_country_code: countryCode,
    p_level: level,
    p_name: name,
  });

  if (error) throw new Error(`Random point lookup failed: ${error.message}`);
  if (!data || data.length === 0) return null;
  return { lat: data[0].lat, lng: data[0].lng };
}

export async function searchRegions(
  countryCode: string,
  query: string,
  level?: number,
): Promise<AdminRegion[]> {
  const client = getSupabaseClient();
  const normalizedQuery = query
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  let q = client
    .from('admin_regions')
    .select('id, country_code, level, name, name_ascii, name_local, parent_id, external_id')
    .eq('country_code', countryCode)
    .ilike('name_ascii', `%${normalizedQuery}%`)
    .order('level')
    .order('name')
    .limit(50);

  if (level !== undefined) {
    q = q.eq('level', level);
  }

  const { data, error } = await q;
  if (error) throw new Error(`Region search failed: ${error.message}`);
  return data ?? [];
}
