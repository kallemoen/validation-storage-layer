# Validation & Storage Layer

The quality gatekeeper for the Weave real estate scraper system. Every listing scraped from any source must pass through this API before it reaches the database. It validates data through a 3-tier pipeline, provides field-level feedback on rejections, and persists accepted listings to Supabase.

```
Scraper Module → Collection Layer → [ Validation & Storage Layer ] → Supabase (Postgres)
                                      ▲ you are here
```

## Live API

**Base URL:** `https://validation-storage-layer.vercel.app`

**Database:** Supabase project `Weave` (us-east-2)

All endpoints require a JWT Bearer token:

```
Authorization: Bearer <token>
```

### Quick test

```bash
# Should return 401 (no token)
curl https://validation-storage-layer.vercel.app/api/scrapers

# Should return 200 with empty list (valid token)
curl https://validation-storage-layer.vercel.app/api/scrapers \
  -H "Authorization: Bearer $DEV_TOKEN"
```

---

## How It Works

### Validation Pipeline

Every listing passes through 3 tiers. Tiers run sequentially with short-circuiting — if Tier 1 fails, Tier 2 and 3 are skipped.

| Tier | Name | Outcome | What it checks |
|---|---|---|---|
| 1 | Schema | Hard reject | Required fields, types, UUIDs, URLs, enums |
| 2 | Semantic | Hard reject | Price ranges, coordinates in country, currency match, room/area bounds |
| 3 | Completeness | Soft warning | Images present, description present, city-level location, minimum field coverage |

**Result statuses:**

| Status | Meaning | Stored? |
|---|---|---|
| `accepted` | Passed all tiers | Yes |
| `accepted_with_warnings` | Passed Tier 1 & 2, has Tier 3 warnings | Yes |
| `rejected` | Failed Tier 1 or 2 | No (stored in rejections table for debugging) |

### Roles

| Role | Purpose | Who uses it |
|---|---|---|
| `development` | Register scrapers, test validation, view rejections | Scraper-building agents |
| `collection` | Submit live listings, update prices, record runs | Collection orchestrator |
| `admin` | Full access | System owner |

---

## Endpoint Overview

### For scraper developers (`development` role)

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/scrapers/register` | Register a new scraper |
| POST | `/api/validate/test` | Validate a single listing (dry run) |
| POST | `/api/validate/test-batch` | Validate a batch of listings (dry run) |
| PATCH | `/api/scrapers/:id/status` | Activate a scraper after testing |
| GET | `/api/rejections` | View recent rejections |
| GET | `/api/rejections/summary` | Aggregate rejection stats |
| POST | `/api/validate/replay/:rejection_id` | Replay a rejection through validation |

### For the collection layer (`collection` role)

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/listings` | Submit a listing (validated + stored) |
| POST | `/api/listings/batch` | Submit up to 100 listings |
| POST | `/api/listings/check-urls` | Check which URLs already exist |
| PATCH | `/api/listings/:id/price` | Update price (auto-tracks history) |
| PATCH | `/api/listings/:id/status` | Mark as sold/delisted/expired |
| PATCH | `/api/scrapers/:id/run` | Record scraper run results |

### Read endpoints (all roles)

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/listings` | Query listings with filters |
| GET | `/api/scrapers` | Query the scraper registry |
| GET | `/api/run-receipts` | View scraper run history |

---

## Typical Workflow

### 1. Register your scraper

```bash
curl -X POST https://validation-storage-layer.vercel.app/api/scrapers/register \
  -H "Authorization: Bearer $DEV_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agency_name": "remax.pt",
    "country_code": "PT",
    "area_key": "Lisboa",
    "listing_type": "rent",
    "config": {
      "currency_code": "EUR",
      "base_url": "https://remax.pt",
      "discovery_url": "https://remax.pt/arrendar/lisboa"
    }
  }'
```

Save the returned `config_id`.

### 2. Test your listing output

```bash
curl -X POST https://validation-storage-layer.vercel.app/api/validate/test \
  -H "Authorization: Bearer $DEV_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "listing_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "source_url": "https://remax.pt/listing/12345",
    "config_id": "YOUR_CONFIG_ID",
    "listing_type": "rent",
    "rent_period": "monthly",
    "country_code": "PT",
    "display_latitude": 38.72,
    "display_longitude": -9.14,
    "location_granularity": "coordinates",
    "property_type": "apartment",
    "price_amount": 170000,
    "price_currency_code": "EUR",
    "raw_data": { "price": "1 700 €" }
  }'
```

If rejected, the response tells you exactly what to fix:

```json
{
  "status": "rejected",
  "tier_1_errors": [
    { "field": "country_code", "rule": "valid_iso_country", "value": "XX" }
  ]
}
```

### 3. Activate your scraper

```bash
curl -X PATCH https://validation-storage-layer.vercel.app/api/scrapers/YOUR_CONFIG_ID/status \
  -H "Authorization: Bearer $DEV_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "status": "active" }'
```

---

## Listing Format (Minimum Viable)

The smallest payload that passes validation:

```json
{
  "listing_id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  "source_url": "https://example.com/property/789",
  "config_id": "YOUR_CONFIG_ID",
  "listing_type": "sale",
  "country_code": "PT",
  "display_latitude": 38.72,
  "display_longitude": -9.14,
  "location_granularity": "country",
  "property_type": "other",
  "raw_data": { "original": "raw scrape data" }
}
```

This passes Tier 1 and 2 but gets Tier 3 warnings for missing images, description, and low completeness. It's still stored with status `accepted_with_warnings`.

For the full field reference (all 35+ fields), see [ListingInput Reference](./docs/listing-input.md).

---

## Key Concepts

**Prices are in minor units.** Store cents, not euros. `170000` = 1,700.00 EUR. The `currencies` table has `minor_units` to convert for display.

**`source_url` must be unique.** This is how deduplication works. Submitting a URL that already exists returns a `409 DUPLICATE` error.

**`config_id` ties everything together.** Every listing references the scraper config that produced it. Register your scraper first, then use the returned `config_id` in every listing you submit.

**`rent_period` is required for rentals.** If `listing_type` is `rent`, you must provide `rent_period` (`monthly`, `weekly`, or `daily`). It must be null/omitted for sales.

**Scrapers start in `testing` status.** They can't receive live data until activated. After 3 consecutive failed runs, a scraper is automatically marked `broken`.

---

## Documentation

| Document | What you'll find |
|---|---|
| [Quickstart Guide](./docs/quickstart.md) | Setup, environment config, step-by-step workflows with curl examples |
| [API Reference](./docs/api-reference.md) | Every endpoint with request/response schemas and status codes |
| [Data Schema](./docs/data-schema.md) | All database tables, fields, types, constraints, and indexes |
| [Validation Rules](./docs/validation-rules.md) | All 19 rules across 3 tiers, configured thresholds, how to add new rules |
| [ListingInput Reference](./docs/listing-input.md) | Complete field reference with full and minimal examples |

---

## Tech Stack

- **Runtime:** Vercel Serverless Functions (Node.js + TypeScript)
- **Database:** Supabase (PostgreSQL 17 + PostGIS)
- **Auth:** Custom JWT with HS256 (via `jose`)
- **Validation:** Zod schemas + custom rule engine
- **Location enrichment:** Mapbox Geocoding API (optional)

---

## Local Development

```bash
npm install
cp .env.example .env.local   # Fill in your Supabase credentials
npm run dev                   # Starts at http://localhost:3000
npm test                      # Run validation engine tests
```

See [Quickstart Guide](./docs/quickstart.md) for full setup instructions.
