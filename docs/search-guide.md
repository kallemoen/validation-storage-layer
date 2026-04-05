# Search API Guide

This guide is a self-contained reference for querying the Weave real estate database. It covers everything you need: what the system is, how to use the search endpoints, the full database schema, and practical query examples.

---

## What This Is

Weave is a multi-country real estate scraping system. Scrapers collect property listings (houses, apartments, land, etc.) from agency websites, and this API validates, enriches, and stores them. The database contains:

- **Listings** — Real estate properties with prices, locations, property details, and images
- **Scrapers** — Registered scraper configurations with health metrics
- **Run receipts** — Execution logs for each scraper run
- **Rejections** — Listings that failed validation, with detailed error breakdowns
- **Admin regions** — Geographic hierarchies with PostGIS polygon boundaries (Portugal, Greece)
- **Currencies** — Reference data for price currencies

You have **read-only SQL access** to all of this data via two API endpoints.

---

## Endpoints

### POST /api/search/execute

Execute an arbitrary read-only SQL query.

**Auth:** `admin` or `reader` role (JWT Bearer token with `app_role: "admin"` or `"reader"`)

**Request:**

```json
{
  "sql": "SELECT listing_id, title, price_amount FROM listings WHERE country_code = 'PT' LIMIT 10"
}
```

- `sql` (string, required): SQL query. Max 10,000 characters. Must start with `SELECT` or `WITH`.

**Response:**

```json
{
  "success": true,
  "data": {
    "rows": [
      { "listing_id": "abc-123", "title": "2BR Apartment in Lisbon", "price_amount": 350000 }
    ],
    "row_count": 1
  }
}
```

**Constraints:**
- **Read-only** — Only SELECT statements. INSERT, UPDATE, DELETE, DROP, and other DML/DDL are blocked at both the application level (keyword filter) and the database engine level (`transaction_read_only`).
- **5-second timeout** — Queries that take longer are cancelled. Use specific columns (not `SELECT *`), add WHERE clauses, and use LIMIT.
- **500-row limit** — If your query has no LIMIT clause, `LIMIT 500` is appended automatically. You can set a lower limit but not higher than 500 effectively (the timeout will stop large scans).
- **Max query length** — 10,000 characters.

**Error responses:**

| Status | Code | Cause |
|--------|------|-------|
| 400 | `INVALID_REQUEST` | Missing or invalid `sql` field |
| 401 | `UNAUTHORIZED` | Missing or invalid token |
| 403 | `FORBIDDEN` | Token role is not `admin` or `reader` |
| 500 | `INTERNAL_ERROR` | Query execution failed (prohibited keyword, timeout, syntax error, etc.) |

The error message from the database is included, so you can see whether it was a syntax error, a prohibited keyword, or a timeout.

### GET /api/search/schema

Returns column metadata for all queryable tables. Useful for discovering column names and types before writing SQL.

**Auth:** `admin` or `reader` role

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "table_name": "listings",
      "columns": [
        { "column_name": "listing_id", "data_type": "uuid", "udt_name": "uuid", "is_nullable": "NO" },
        { "column_name": "title", "data_type": "character varying", "udt_name": "varchar", "is_nullable": "NO" }
      ]
    }
  ]
}
```

---

## Database Schema

### listings

The core table. Each row is a validated, accepted real estate listing.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `listing_id` | UUID | No | Primary key, assigned by the scraper |
| `source_url` | VARCHAR(2000) | No | Original listing URL (unique) |
| `config_id` | UUID | No | FK to `scraper_registry.config_id` — which scraper submitted this |
| `listing_type` | VARCHAR(10) | No | `'sale'` or `'rent'` |
| `rent_period` | VARCHAR(10) | Yes | `'monthly'`, `'weekly'`, or `'daily'` — only for rent listings |
| `country_code` | CHAR(2) | No | ISO country code (e.g., `'PT'`, `'GR'`) |
| `admin_level_1` | VARCHAR(255) | Yes | Top-level admin division (e.g., "Lisboa" district in PT, "Attica" region in GR) |
| `admin_level_2` | VARCHAR(255) | Yes | Second-level (e.g., "Lisboa" municipality in PT, "Central Athens" regional unit in GR) |
| `admin_level_3` | VARCHAR(255) | Yes | Third-level (e.g., "Avenidas Novas" parish in PT, "Athens" municipality in GR) |
| `admin_level_4` | VARCHAR(255) | Yes | Fourth-level subdivision (if applicable) |
| `postal_code` | VARCHAR(20) | Yes | Postal/zip code |
| `address_line_1` | VARCHAR(500) | Yes | Street address |
| `address_line_2` | VARCHAR(500) | Yes | Additional address info |
| `latitude` | DOUBLE PRECISION | Yes | Exact latitude (scraper-provided) |
| `longitude` | DOUBLE PRECISION | Yes | Exact longitude (scraper-provided) |
| `display_latitude` | DOUBLE PRECISION | No | Server-computed display coordinate (exact or random point in region) |
| `display_longitude` | DOUBLE PRECISION | No | Server-computed display coordinate |
| `location_granularity` | VARCHAR(20) | No | How precise the location is — see enum values below |
| `price_amount` | BIGINT | Yes | Price in minor currency units (e.g., cents). Null = price not available |
| `price_currency_code` | CHAR(3) | Yes | ISO currency code (e.g., `'EUR'`). Always paired with price_amount |
| `price_scraped_at` | TIMESTAMPTZ | Yes | When the price was last scraped |
| `price_history` | JSONB | No | Array of `{amount, currency_code, scraped_at}` — previous prices |
| `bedrooms` | INTEGER | Yes | Number of bedrooms |
| `bathrooms` | NUMERIC | Yes | Number of bathrooms (can be 1.5, etc.) |
| `total_rooms` | INTEGER | Yes | Total room count |
| `living_area_sqm` | NUMERIC | Yes | Living area in square meters |
| `plot_area_sqm` | NUMERIC | Yes | Plot/land area in square meters |
| `raw_room_description` | VARCHAR(500) | Yes | Free-text room description from source |
| `property_type` | VARCHAR(20) | No | See enum values below |
| `property_subtype` | VARCHAR(100) | Yes | More specific type (e.g., "villa", "studio", "penthouse") |
| `raw_property_type` | VARCHAR(500) | Yes | Original property type string from source website |
| `title` | VARCHAR(500) | No | Listing title |
| `description` | TEXT | Yes | Full listing description |
| `images` | JSONB | Yes | Array of image URLs |
| `features` | JSONB | Yes | Array of feature tags (e.g., `["garage", "pool", "elevator"]`) |
| `raw_data` | JSONB | No | Complete original data from the scraper (catch-all) |
| `listing_status` | VARCHAR(20) | No | See enum values below. Default: `'active'` |
| `created_at` | TIMESTAMPTZ | No | When the listing was first stored |
| `updated_at` | TIMESTAMPTZ | No | Last modification time |

**Indexes:** source_url (unique), config_id, country_code, listing_status, listing_type, created_at

### scraper_registry

Each row is a registered scraper with its configuration and health state.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `config_id` | UUID | No | Primary key |
| `agency_name` | VARCHAR(255) | No | Name of the real estate agency being scraped |
| `country_code` | CHAR(2) | No | Country this scraper targets |
| `area_key` | VARCHAR(255) | No | Geographic area identifier |
| `listing_type` | VARCHAR(10) | No | `'sale'` or `'rent'` |
| `status` | VARCHAR(20) | No | See enum values below |
| `config` | JSONB | No | Scraper-specific configuration (URLs, selectors, etc.) |
| `created_at` | TIMESTAMPTZ | No | Registration time |
| `last_run_at` | TIMESTAMPTZ | Yes | Last execution time |
| `last_run_status` | VARCHAR(20) | Yes | `'success'`, `'partial'`, or `'failure'` |
| `last_run_listings` | INTEGER | Yes | Listings submitted in last run |
| `failure_count` | INTEGER | No | Consecutive failures (resets on success) |
| `broken_at` | TIMESTAMPTZ | Yes | When scraper entered broken state |
| `repair_count` | INTEGER | No | Times scraper has been repaired |
| `acceptance_rate` | NUMERIC | Yes | Fraction of listings accepted in last batch (0.0–1.0) |
| `last_batch_at` | TIMESTAMPTZ | Yes | Last batch submission time |
| `last_batch_submitted` | INTEGER | Yes | Listings in last batch |
| `last_batch_accepted` | INTEGER | Yes | Accepted listings in last batch |
| `top_rejection_rule` | VARCHAR(100) | Yes | Most common rejection rule in last batch |
| `degraded_at` | TIMESTAMPTZ | Yes | When scraper entered degraded state |
| `expected_discovery_count` | INTEGER | No | Expected URLs to discover per run |
| `run_interval_hours` | INTEGER | No | Expected hours between runs |
| `last_successful_insert_at` | TIMESTAMPTZ | Yes | Last time a listing was successfully stored |
| `status_reason` | TEXT | Yes | Human-readable explanation of current status |

**Indexes:** status, country_code

### run_receipts

Execution logs for scraper runs.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | UUID | No | Primary key |
| `config_id` | UUID | No | FK to scraper_registry |
| `started_at` | TIMESTAMPTZ | No | Run start time |
| `completed_at` | TIMESTAMPTZ | No | Run end time |
| `status` | VARCHAR(20) | No | `'success'`, `'partial'`, or `'failure'` |
| `failure_stage` | VARCHAR(20) | Yes | `'discovery'`, `'extraction'`, or `'validation'` — where it failed |
| `urls_discovered` | INTEGER | Yes | Total URLs found |
| `urls_new` | INTEGER | Yes | New URLs (not seen before) |
| `listings_extracted` | INTEGER | Yes | Successfully extracted from pages |
| `listings_submitted` | INTEGER | Yes | Sent to validation API |
| `listings_accepted` | INTEGER | Yes | Passed validation |
| `listings_rejected` | INTEGER | Yes | Failed validation |
| `error_message` | TEXT | Yes | Error details if failed |

**Indexes:** config_id, started_at

### rejections

Listings that failed validation. Useful for debugging scraper issues.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | UUID | No | Primary key |
| `config_id` | UUID | No | FK to scraper_registry |
| `mode` | VARCHAR(10) | No | `'test'` (development testing) or `'live'` (production submission) |
| `listing_data` | JSONB | No | The full listing payload that was rejected |
| `tier_1_errors` | JSONB | No | Schema validation errors (array of `{rule, message, field?}`) |
| `tier_2_errors` | JSONB | No | Semantic validation errors (array of `{rule, message, field?}`) |
| `tier_3_warnings` | JSONB | No | Completeness warnings (array of `{rule, message, field?}`) |
| `created_at` | TIMESTAMPTZ | No | When the rejection was recorded |

**Indexes:** config_id, created_at

### admin_regions

Geographic hierarchy with PostGIS polygon boundaries. Currently contains Portugal (PT) and Greece (GR).

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | INTEGER | No | Primary key (auto-increment) |
| `country_code` | CHAR(2) | No | Country this region belongs to |
| `level` | SMALLINT | No | Admin level (1 = top, up to 4) |
| `name` | VARCHAR(255) | No | Official region name |
| `name_ascii` | VARCHAR(255) | No | ASCII transliteration (no diacritics) |
| `name_local` | VARCHAR(255) | Yes | Name in local script (e.g., Greek) |
| `parent_id` | INTEGER | Yes | FK to parent region (self-join). Null for level 1 |
| `boundary` | geometry(MultiPolygon, 4326) | Yes | PostGIS polygon boundary |
| `centroid` | geometry(Point, 4326) | Yes | Centroid of the boundary |
| `external_id` | VARCHAR(100) | Yes | External reference ID |

**Indexes:** (country_code, level), parent_id, (name_ascii, country_code, level), boundary (GIST)

**Important:** The `boundary` and `centroid` columns are PostGIS geometry types. They serialize to large WKB hex strings in JSON. Use `ST_AsText(boundary)` or `ST_AsGeoJSON(boundary)` to get readable output. Avoid `SELECT *` on this table.

### admin_level_config

Defines the geographic hierarchy labels for each supported country.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `country_code` | CHAR(2) | No | Primary key |
| `level_1_label` | VARCHAR(50) | No | Label for level 1 (e.g., "District" for PT, "Region" for GR) |
| `level_2_label` | VARCHAR(50) | Yes | Label for level 2 (e.g., "Municipality" for PT) |
| `level_3_label` | VARCHAR(50) | Yes | Label for level 3 (e.g., "Parish" for PT) |
| `level_4_label` | VARCHAR(50) | Yes | Label for level 4 |
| `max_level` | SMALLINT | No | Highest admin level for this country |

### currencies

Reference table for price currencies.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `code` | CHAR(3) | No | Primary key, ISO currency code (e.g., `'EUR'`) |
| `name` | VARCHAR(100) | No | Full name (e.g., "Euro") |
| `symbol` | VARCHAR(5) | No | Display symbol (e.g., "€") |
| `minor_units` | SMALLINT | No | Decimal places (e.g., 2 for EUR — 100 cents = 1 euro) |

---

## Table Relationships

```
listings.config_id          → scraper_registry.config_id
listings.price_currency_code → currencies.code
run_receipts.config_id      → scraper_registry.config_id
rejections.config_id        → scraper_registry.config_id
admin_regions.parent_id     → admin_regions.id (self-join hierarchy)
```

---

## Enum Values

These are the valid values for key columns. Use these in your WHERE clauses.

**listing_type:** `'sale'`, `'rent'`

**property_type:** `'house'`, `'apartment'`, `'land'`, `'commercial'`, `'mixed_use'`, `'parking'`, `'other'`

**listing_status:** `'active'`, `'sold'`, `'delisted'`, `'expired'`

**rent_period:** `'monthly'`, `'weekly'`, `'daily'` (only for rent listings)

**location_granularity:** `'coordinates'`, `'address'`, `'postal_code'`, `'admin_level_4'`, `'admin_level_3'`, `'admin_level_2'`, `'admin_level_1'`, `'country'`

**scraper status:** `'active'`, `'paused'`, `'broken'`, `'testing'`, `'degraded'`

**run status:** `'success'`, `'partial'`, `'failure'`

**failure_stage:** `'discovery'`, `'extraction'`, `'validation'`

**rejection mode:** `'test'`, `'live'`

**Supported countries:** `'PT'` (Portugal), `'GR'` (Greece)

---

## PostGIS / Spatial Queries

The `admin_regions` table has PostGIS geometry columns. Here are the key spatial operations:

### Reading geometry as text

```sql
-- Human-readable WKT
SELECT name, ST_AsText(boundary) FROM admin_regions WHERE country_code = 'PT' AND level = 1 LIMIT 5

-- GeoJSON format
SELECT name, ST_AsGeoJSON(centroid) FROM admin_regions WHERE country_code = 'PT' AND level = 1 LIMIT 5
```

### Point-in-polygon: find which region contains a coordinate

```sql
SELECT name, level
FROM admin_regions
WHERE country_code = 'PT'
  AND level = 2
  AND ST_Contains(boundary, ST_SetSRID(ST_Point(-9.1393, 38.7223), 4326))
```

### Listings within a region boundary

```sql
SELECT l.listing_id, l.title, l.price_amount
FROM listings l
JOIN admin_regions ar ON ar.country_code = l.country_code
  AND ar.name = l.admin_level_1
  AND ar.level = 1
WHERE l.country_code = 'PT'
  AND ST_Contains(ar.boundary, ST_SetSRID(ST_Point(l.longitude, l.latitude), 4326))
LIMIT 50
```

### Distance queries

```sql
-- Listings within 5km of a point
SELECT listing_id, title,
  ST_Distance(
    ST_SetSRID(ST_Point(longitude, latitude), 4326)::geography,
    ST_SetSRID(ST_Point(-9.1393, 38.7223), 4326)::geography
  ) AS distance_meters
FROM listings
WHERE latitude IS NOT NULL
  AND ST_DWithin(
    ST_SetSRID(ST_Point(longitude, latitude), 4326)::geography,
    ST_SetSRID(ST_Point(-9.1393, 38.7223), 4326)::geography,
    5000
  )
ORDER BY distance_meters
LIMIT 50
```

---

## Example Queries

### Basic: count listings by country

```sql
SELECT country_code, COUNT(*) AS total
FROM listings
GROUP BY country_code
ORDER BY total DESC
```

### Filter by property type and price range

```sql
SELECT listing_id, title, price_amount, price_currency_code, admin_level_1
FROM listings
WHERE country_code = 'PT'
  AND property_type = 'apartment'
  AND listing_type = 'sale'
  AND price_amount BETWEEN 15000000 AND 50000000
ORDER BY price_amount ASC
LIMIT 50
```

Note: `price_amount` is in minor units (cents for EUR), so 150,000 EUR = 15000000.

### Average price per region

```sql
SELECT admin_level_1, property_type,
  COUNT(*) AS listings,
  ROUND(AVG(price_amount) / 100, 2) AS avg_price_eur,
  ROUND(MIN(price_amount) / 100, 2) AS min_price_eur,
  ROUND(MAX(price_amount) / 100, 2) AS max_price_eur
FROM listings
WHERE country_code = 'PT'
  AND listing_type = 'sale'
  AND price_amount IS NOT NULL
  AND price_currency_code = 'EUR'
GROUP BY admin_level_1, property_type
ORDER BY avg_price_eur DESC
LIMIT 50
```

### Listings with scraper info (JOIN)

```sql
SELECT l.listing_id, l.title, l.price_amount,
  s.agency_name, s.status AS scraper_status
FROM listings l
JOIN scraper_registry s ON s.config_id = l.config_id
WHERE l.country_code = 'PT'
ORDER BY l.created_at DESC
LIMIT 20
```

### Rejection rate by scraper

```sql
SELECT s.agency_name, s.country_code, s.status,
  s.acceptance_rate,
  s.last_batch_submitted,
  s.last_batch_accepted,
  s.top_rejection_rule
FROM scraper_registry s
WHERE s.last_batch_at IS NOT NULL
ORDER BY s.acceptance_rate ASC
LIMIT 50
```

### Top rejection reasons across all scrapers

```sql
SELECT
  elem->>'rule' AS rule,
  COUNT(*) AS occurrences
FROM rejections,
  jsonb_array_elements(tier_1_errors) AS elem
WHERE mode = 'live'
  AND created_at > now() - INTERVAL '7 days'
GROUP BY elem->>'rule'
ORDER BY occurrences DESC
LIMIT 20
```

### JSONB: query price history

```sql
SELECT listing_id, title, price_amount,
  jsonb_array_length(price_history) AS price_changes,
  price_history
FROM listings
WHERE jsonb_array_length(price_history) > 0
ORDER BY jsonb_array_length(price_history) DESC
LIMIT 20
```

### JSONB: search features array

```sql
SELECT listing_id, title, features
FROM listings
WHERE features IS NOT NULL
  AND features @> '["pool"]'::jsonb
LIMIT 50
```

### Window function: price ranking within a region

```sql
SELECT listing_id, title, admin_level_1, price_amount,
  RANK() OVER (PARTITION BY admin_level_1 ORDER BY price_amount ASC) AS price_rank
FROM listings
WHERE country_code = 'PT'
  AND listing_type = 'sale'
  AND price_amount IS NOT NULL
  AND property_type = 'apartment'
ORDER BY admin_level_1, price_rank
LIMIT 100
```

### Scraper health summary

```sql
SELECT status, COUNT(*) AS scrapers,
  ROUND(AVG(acceptance_rate), 2) AS avg_acceptance_rate,
  SUM(CASE WHEN last_run_status = 'failure' THEN 1 ELSE 0 END) AS failing_runs
FROM scraper_registry
GROUP BY status
ORDER BY scrapers DESC
```

### Stale scrapers (no activity in expected window)

```sql
SELECT config_id, agency_name, status, status_reason,
  last_run_at,
  last_successful_insert_at,
  run_interval_hours,
  EXTRACT(EPOCH FROM (now() - last_run_at)) / 3600 AS hours_since_last_run
FROM scraper_registry
WHERE last_run_at < now() - (run_interval_hours * INTERVAL '1 hour' * 2)
ORDER BY last_run_at ASC
LIMIT 50
```

### Run history for a specific scraper

```sql
SELECT started_at, completed_at, status, failure_stage,
  urls_discovered, urls_new, listings_submitted, listings_accepted, listings_rejected,
  EXTRACT(EPOCH FROM (completed_at - started_at)) AS duration_seconds
FROM run_receipts
WHERE config_id = 'your-config-id-here'
ORDER BY started_at DESC
LIMIT 20
```

### Geographic hierarchy: browse admin regions

```sql
SELECT ar.name, ar.level, alc.level_1_label, alc.level_2_label, alc.level_3_label,
  parent.name AS parent_name
FROM admin_regions ar
JOIN admin_level_config alc ON alc.country_code = ar.country_code
LEFT JOIN admin_regions parent ON parent.id = ar.parent_id
WHERE ar.country_code = 'PT'
  AND ar.level = 2
ORDER BY ar.name
LIMIT 50
```

### New listings per day (time series)

```sql
SELECT DATE(created_at) AS day, COUNT(*) AS new_listings
FROM listings
WHERE created_at > now() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY day DESC
```

---

## Constraints and Tips

1. **5-second timeout** — Complex joins on large tables or unindexed columns will timeout. Always add WHERE clauses to narrow the scan.

2. **500-row limit** — Set your own LIMIT (up to 500). For aggregations (COUNT, AVG, etc.), the limit applies to the number of result rows, not the rows scanned.

3. **Avoid `SELECT *` on `admin_regions`** — The `boundary` column contains large geometry data. Always select specific columns, or use `ST_AsText(boundary)` if you need the geometry.

4. **Price is in minor units** — `price_amount` is stored in the smallest currency unit (cents for EUR). Divide by 100 for display: `price_amount / 100.0 AS price_eur`.

5. **Use indexed columns in WHERE** — The indexed columns are: `listings.source_url`, `listings.config_id`, `listings.country_code`, `listings.listing_status`, `listings.listing_type`, `listings.created_at`, `scraper_registry.status`, `scraper_registry.country_code`, `run_receipts.config_id`, `run_receipts.started_at`, `rejections.config_id`, `rejections.created_at`, `admin_regions.(country_code, level)`, `admin_regions.parent_id`, `admin_regions.(name_ascii, country_code, level)`, `admin_regions.boundary` (GIST).

6. **JSONB queries** — Use `->>'key'` for text extraction, `@>` for containment checks, `jsonb_array_elements()` to unnest arrays. The `features`, `price_history`, `images`, `raw_data`, `config`, `listing_data`, `tier_1_errors`, `tier_2_errors`, and `tier_3_warnings` columns are all JSONB.

7. **PostGIS coordinates** — Always use SRID 4326 (WGS84): `ST_SetSRID(ST_Point(longitude, latitude), 4326)`. Note: PostGIS uses (x, y) = (longitude, latitude) order.
