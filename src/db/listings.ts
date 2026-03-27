import { getSupabaseClient } from './client.js';
import type { ListingInput, ListingInsertRow, PriceHistoryEntry } from '../types/listing.js';

export async function insertListing(input: ListingInsertRow): Promise<{ id: string }> {
  const client = getSupabaseClient();
  const { error } = await client.from('listings').insert({
    listing_id: input.listing_id,
    source_url: input.source_url,
    config_id: input.config_id,
    listing_type: input.listing_type,
    rent_period: input.rent_period ?? null,
    country_code: input.country_code,
    admin_level_1: input.admin_level_1 ?? null,
    admin_level_2: input.admin_level_2 ?? null,
    admin_level_3: input.admin_level_3 ?? null,
    admin_level_4: input.admin_level_4 ?? null,
    postal_code: input.postal_code ?? null,
    address_line_1: input.address_line_1 ?? null,
    address_line_2: input.address_line_2 ?? null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    display_latitude: input.display_latitude,
    display_longitude: input.display_longitude,
    location_granularity: input.location_granularity,
    price_amount: input.price_amount ?? null,
    price_currency_code: input.price_currency_code ?? null,
    price_scraped_at: input.price_scraped_at ?? null,
    price_history: [],
    bedrooms: input.bedrooms ?? null,
    bathrooms: input.bathrooms ?? null,
    total_rooms: input.total_rooms ?? null,
    living_area_sqm: input.living_area_sqm ?? null,
    plot_area_sqm: input.plot_area_sqm ?? null,
    raw_room_description: input.raw_room_description ?? null,
    property_type: input.property_type,
    property_subtype: input.property_subtype ?? null,
    raw_property_type: input.raw_property_type ?? null,
    title: input.title,
    description: input.description ?? null,
    images: input.images ?? null,
    raw_data: input.raw_data,
  });

  if (error) {
    if (error.code === '23505') {
      throw new DuplicateUrlError(input.source_url);
    }
    throw new Error(`Failed to insert listing: ${error.message}`);
  }

  return { id: input.listing_id };
}

export async function insertListingsBatch(inputs: ListingInsertRow[]): Promise<{ inserted: number; duplicates: string[] }> {
  const client = getSupabaseClient();
  const duplicates: string[] = [];
  let inserted = 0;

  const rows = inputs.map(input => ({
    listing_id: input.listing_id,
    source_url: input.source_url,
    config_id: input.config_id,
    listing_type: input.listing_type,
    rent_period: input.rent_period ?? null,
    country_code: input.country_code,
    admin_level_1: input.admin_level_1 ?? null,
    admin_level_2: input.admin_level_2 ?? null,
    admin_level_3: input.admin_level_3 ?? null,
    admin_level_4: input.admin_level_4 ?? null,
    postal_code: input.postal_code ?? null,
    address_line_1: input.address_line_1 ?? null,
    address_line_2: input.address_line_2 ?? null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    display_latitude: input.display_latitude,
    display_longitude: input.display_longitude,
    location_granularity: input.location_granularity,
    price_amount: input.price_amount ?? null,
    price_currency_code: input.price_currency_code ?? null,
    price_scraped_at: input.price_scraped_at ?? null,
    price_history: [],
    bedrooms: input.bedrooms ?? null,
    bathrooms: input.bathrooms ?? null,
    total_rooms: input.total_rooms ?? null,
    living_area_sqm: input.living_area_sqm ?? null,
    plot_area_sqm: input.plot_area_sqm ?? null,
    raw_room_description: input.raw_room_description ?? null,
    property_type: input.property_type,
    property_subtype: input.property_subtype ?? null,
    raw_property_type: input.raw_property_type ?? null,
    title: input.title,
    description: input.description ?? null,
    images: input.images ?? null,
    raw_data: input.raw_data,
  }));

  // Attempt bulk insert; on duplicate, fall back to individual inserts
  const { error } = await client.from('listings').insert(rows);

  if (error) {
    if (error.code === '23505') {
      // Fall back to individual inserts to identify duplicates
      for (const input of inputs) {
        try {
          await insertListing(input);
          inserted++;
        } catch (e) {
          if (e instanceof DuplicateUrlError) {
            duplicates.push(input.source_url);
          } else {
            throw e;
          }
        }
      }
      return { inserted, duplicates };
    }
    throw new Error(`Failed to insert listings batch: ${error.message}`);
  }

  return { inserted: rows.length, duplicates: [] };
}

export async function getListingById(listingId: string) {
  const client = getSupabaseClient();
  const { data, error } = await client.from('listings').select('*').eq('listing_id', listingId).single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to get listing: ${error.message}`);
  }
  return data;
}

export async function queryListings(filters: {
  config_id?: string;
  country_code?: string;
  listing_type?: string;
  listing_status?: string;
  limit?: number;
  offset?: number;
}) {
  const client = getSupabaseClient();
  let query = client.from('listings').select('*', { count: 'exact' });

  if (filters.config_id) query = query.eq('config_id', filters.config_id);
  if (filters.country_code) query = query.eq('country_code', filters.country_code);
  if (filters.listing_type) query = query.eq('listing_type', filters.listing_type);
  if (filters.listing_status) query = query.eq('listing_status', filters.listing_status);

  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  query = query.range(offset, offset + limit - 1).order('created_at', { ascending: false });

  const { data, error, count } = await query;
  if (error) throw new Error(`Failed to query listings: ${error.message}`);
  return { data: data ?? [], total: count ?? 0, limit, offset };
}

export async function checkExistingUrls(urls: string[]): Promise<string[]> {
  const client = getSupabaseClient();
  const { data, error } = await client.from('listings').select('source_url').in('source_url', urls);
  if (error) throw new Error(`Failed to check URLs: ${error.message}`);
  return (data ?? []).map(row => row.source_url);
}

export async function updateListingPrice(
  listingId: string,
  newAmount: number,
  newCurrencyCode: string,
) {
  const existing = await getListingById(listingId);
  if (!existing) return null;

  const client = getSupabaseClient();
  const now = new Date().toISOString();

  // Price unchanged — only update timestamp
  if (existing.price_amount === newAmount && existing.price_currency_code === newCurrencyCode) {
    const { error } = await client
      .from('listings')
      .update({ price_scraped_at: now, updated_at: now })
      .eq('listing_id', listingId);
    if (error) throw new Error(`Failed to update price timestamp: ${error.message}`);
    return { changed: false };
  }

  // Price changed — push current to history, replace with new
  const historyEntry: PriceHistoryEntry = {
    amount: existing.price_amount,
    currency_code: existing.price_currency_code,
    scraped_at: existing.price_scraped_at,
  };

  const updatedHistory = [...(existing.price_history ?? []), historyEntry];

  const { error } = await client
    .from('listings')
    .update({
      price_amount: newAmount,
      price_currency_code: newCurrencyCode,
      price_scraped_at: now,
      price_history: updatedHistory,
      updated_at: now,
    })
    .eq('listing_id', listingId);

  if (error) throw new Error(`Failed to update price: ${error.message}`);
  return { changed: true };
}

export async function updateListingStatus(listingId: string, status: string) {
  const client = getSupabaseClient();
  const { error, count } = await client
    .from('listings')
    .update({ listing_status: status, updated_at: new Date().toISOString() })
    .eq('listing_id', listingId);
  if (error) throw new Error(`Failed to update listing status: ${error.message}`);
  return count !== 0;
}

export class DuplicateUrlError extends Error {
  constructor(public readonly sourceUrl: string) {
    super(`Listing with source_url '${sourceUrl}' already exists`);
    this.name = 'DuplicateUrlError';
  }
}
