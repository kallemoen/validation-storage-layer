# Validation & Storage Layer — API Reference

## Overview

The Validation & Storage Layer is the quality gatekeeper for the scraper system. Every listing must pass through this API before it can be stored in the database. The API validates data through a 3-tier pipeline, provides detailed feedback on rejections, and persists accepted listings.

**Base URL:** Your Vercel deployment URL (e.g., `https://your-project.vercel.app`)

---

## Authentication

All endpoints require a JWT Bearer token in the `Authorization` header.

```
Authorization: Bearer <token>
```

The JWT must contain an `app_role` claim with one of three values:

| Role | Description | Typical consumer |
|---|---|---|
| `development` | Build and test scrapers | Scraper-building agents |
| `collection` | Submit live data and manage runs | Collection layer / orchestrator |
| `admin` | Full read access, manage registry | Owner / dashboard |

Tokens are verified against the `SUPABASE_JWT_SECRET` environment variable using the HS256 algorithm.

### Error responses

| Status | Code | Meaning |
|---|---|---|
| `401` | `UNAUTHORIZED` | Missing, invalid, or expired token |
| `403` | `FORBIDDEN` | Valid token but role not permitted for this endpoint |

---

## Response Format

All endpoints return a consistent JSON envelope:

```json
// Success
{
  "success": true,
  "data": { ... }
}

// Error
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description",
    "details": { ... }  // Optional, e.g. Zod validation issues
  }
}
```

---

## Endpoints

### Validation

#### POST /api/validate/test

Validate a single listing without storing it. Use this to iterate on scraper output during development.

**Role:** `development`

**Request body:** A `ListingInput` object (see [Data Schema](#listinginput)).

```json
{
  "listing_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "source_url": "https://remax.pt/listing/12345",
  "config_id": "a9b8c7d6-e5f4-4a3b-8c2d-1e0f9a8b7c6d",
  "listing_type": "rent",
  "rent_period": "monthly",
  "country_code": "PT",
  "display_latitude": 38.7191,
  "display_longitude": -9.1438,
  "location_granularity": "coordinates",
  "property_type": "apartment",
  "raw_data": { "price": "1 700 €/ Mensal" }
}
```

**Response (200):** A `ValidationResult` object.

```json
{
  "success": true,
  "data": {
    "status": "accepted",
    "listing_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "config_id": "a9b8c7d6-e5f4-4a3b-8c2d-1e0f9a8b7c6d",
    "mode": "test",
    "tier_1_errors": [],
    "tier_2_errors": [],
    "tier_3_warnings": [],
    "evaluated_at": "2026-03-25T14:30:00.000Z"
  }
}
```

**Rejection example:**

```json
{
  "success": true,
  "data": {
    "status": "rejected",
    "listing_id": "a1b2c3d4-...",
    "config_id": "a9b8c7d6-...",
    "mode": "test",
    "tier_1_errors": [
      {
        "field": "country_code",
        "rule": "valid_iso_country",
        "value": "XX",
        "expected": "Valid ISO 3166-1 alpha-2 code"
      }
    ],
    "tier_2_errors": [],
    "tier_3_warnings": [],
    "evaluated_at": "2026-03-25T14:30:00.000Z"
  }
}
```

Rejected listings are automatically stored in the rejections table for later troubleshooting.

---

#### POST /api/validate/test-batch

Validate multiple listings without storing them. All listings in a batch must share the same `config_id`.

**Role:** `development`

**Request body:**

```json
{
  "listings": [
    { "listing_id": "...", "config_id": "...", ... },
    { "listing_id": "...", "config_id": "...", ... }
  ]
}
```

**Limits:** Maximum 100 listings per batch.

**Response (200):** A `BatchValidationResult` with per-listing results and an aggregate summary.

```json
{
  "success": true,
  "data": {
    "results": [
      { "status": "accepted", "listing_id": "...", ... },
      { "status": "rejected", "listing_id": "...", "tier_1_errors": [...], ... }
    ],
    "summary": {
      "config_id": "a9b8c7d6-...",
      "total_submitted": 50,
      "accepted": 35,
      "accepted_with_warnings": 8,
      "rejected": 7,
      "top_rejection_reasons": [
        { "rule": "price_plausible", "count": 4 },
        { "rule": "required_field", "count": 3 }
      ]
    }
  }
}
```

---

#### POST /api/validate/replay/{rejection_id}

Replay a previously rejected listing through validation. Use this to verify that a fix works against the exact data that originally failed.

**Role:** `development`

**Path parameters:**
- `rejection_id` (UUID) — The ID of the rejection record to replay.

**Request body:** None.

**Response (200):**

```json
{
  "success": true,
  "data": {
    "original_rejection_id": "...",
    "replay_result": {
      "status": "accepted",
      "listing_id": "...",
      ...
    }
  }
}
```

---

### Listings

#### POST /api/listings

Validate and store a single listing in the database. This is the primary ingestion endpoint for the collection layer.

**Role:** `collection`

**Request body:** A `ListingInput` object (see [Data Schema](#listinginput)).

**Response (201):** A `ValidationResult` if accepted.

**Response (200):** A `ValidationResult` if rejected (listing is not stored, rejection record is created).

**Response (409):** If a listing with the same `source_url` already exists.

```json
{
  "success": false,
  "error": {
    "code": "DUPLICATE",
    "message": "Listing with source_url 'https://...' already exists"
  }
}
```

**Flow:**
1. Validates through 3-tier pipeline
2. If rejected: stores rejection record, returns feedback
3. If accepted: enriches location data via Mapbox geocoding, inserts into database

---

#### POST /api/listings/batch

Validate and store multiple listings in one request.

**Role:** `collection`

**Request body:**

```json
{
  "listings": [ { ... }, { ... } ]
}
```

**Limits:** Maximum 100 listings per batch.

**Response (201):**

```json
{
  "success": true,
  "data": {
    "validation": {
      "results": [ ... ],
      "summary": { ... }
    },
    "storage": {
      "inserted": 35,
      "duplicates": ["https://example.com/listing/old"]
    }
  }
}
```

---

#### GET /api/listings

Query stored listings with optional filters.

**Role:** `development`, `collection`, `admin`

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `config_id` | UUID | Filter by scraper config |
| `country_code` | string | Filter by country (ISO 3166-1 alpha-2) |
| `listing_type` | string | `sale` or `rent` |
| `listing_status` | string | `active`, `sold`, `delisted`, `expired` |
| `limit` | integer | Results per page (default: 50) |
| `offset` | integer | Pagination offset (default: 0) |

**Response (200):**

```json
{
  "success": true,
  "data": {
    "data": [ { "listing_id": "...", ... } ],
    "total": 150,
    "limit": 50,
    "offset": 0
  }
}
```

---

#### POST /api/listings/check-urls

Check a list of source URLs against the database to identify which ones already exist. Use this for deduplication before scraping.

**Role:** `collection`

**Request body:**

```json
{
  "urls": [
    "https://remax.pt/listing/12345",
    "https://remax.pt/listing/67890"
  ]
}
```

**Limits:** Maximum 1000 URLs per request.

**Response (200):**

```json
{
  "success": true,
  "data": {
    "existing_urls": ["https://remax.pt/listing/12345"]
  }
}
```

---

#### PATCH /api/listings/{id}/price

Update the price on an existing listing. Automatically manages price history.

**Role:** `collection`

**Path parameters:**
- `id` (UUID) — The listing ID.

**Request body:**

```json
{
  "price_amount": 180000,
  "price_currency_code": "EUR"
}
```

**Behavior:**
- **Price changed:** Current price is pushed to `price_history`, new price replaces it, `price_scraped_at` is updated.
- **Price unchanged:** Only `price_scraped_at` is updated. No new history entry is created.

**Response (200):**

```json
{
  "success": true,
  "data": {
    "listing_id": "a1b2c3d4-...",
    "price_changed": true
  }
}
```

---

#### PATCH /api/listings/{id}/status

Update the status of an existing listing.

**Role:** `collection`

**Path parameters:**
- `id` (UUID) — The listing ID.

**Request body:**

```json
{
  "listing_status": "sold"
}
```

**Valid values:** `active`, `sold`, `delisted`, `expired`

**Response (200):**

```json
{
  "success": true,
  "data": {
    "listing_id": "a1b2c3d4-...",
    "listing_status": "sold"
  }
}
```

---

### Geography

#### GET /api/geography/:country_code

Browse the admin region hierarchy for a supported country. Returns the full region tree by default, or a filtered subset.

**Role:** `development`, `collection`

**Path parameters:**
- `country_code` — ISO 3166-1 alpha-2 code (e.g., `PT`).

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `level` | integer | Return a flat list of regions at this admin level (1 through max level for the country) |
| `parent` | string | Return the children of a specific region (case-insensitive name match) |

If neither `level` nor `parent` is provided, the full hierarchy tree is returned along with level metadata (labels and counts).

**Response (200) — default (full tree):**

```json
{
  "success": true,
  "data": {
    "country_code": "PT",
    "levels": {
      "1": { "label": "Distrito", "count": 20 },
      "2": { "label": "Concelho", "count": 308 },
      "3": { "label": "Freguesia", "count": 3092 }
    },
    "regions": [
      { "name": "Lisboa", "level": 1, "children": [
        { "name": "Lisboa", "level": 2, "children": [...] }
      ]}
    ]
  }
}
```

**Response (200) — filtered by `level`:**

```json
{
  "success": true,
  "data": {
    "country_code": "PT",
    "regions": [
      { "name": "Lisboa", "level": 1 },
      { "name": "Porto", "level": 1 }
    ]
  }
}
```

**Response (200) — filtered by `parent`:**

```json
{
  "success": true,
  "data": {
    "country_code": "PT",
    "parent": "Lisboa",
    "children": [
      { "name": "Lisboa", "level": 2 },
      { "name": "Sintra", "level": 2 }
    ]
  }
}
```

**Response (404):** Country has no geography configuration.

---

#### GET /api/geography/:country_code/search

Fuzzy-search for regions within a country. Returns matching regions with their full ancestry path.

**Role:** `development`, `collection`

**Path parameters:**
- `country_code` — ISO 3166-1 alpha-2 code.

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `q` | string | **Required.** Search query (e.g., `"lisb"`, `"santo antonio"`). |
| `level` | integer | Restrict results to a specific admin level. |

**Response (200):**

```json
{
  "success": true,
  "data": {
    "country_code": "PT",
    "query": "lisb",
    "count": 3,
    "results": [
      { "name": "Lisboa", "level": 1, "path": "Lisboa" },
      { "name": "Lisboa", "level": 2, "path": "Lisboa > Lisboa" },
      { "name": "Lisboa", "level": 3, "path": "Lisboa > Lisboa > Santa Maria Maior" }
    ]
  }
}
```

**Response (404):** Country has no geography data.

---

### Scraper Registry

#### GET /api/scrapers

Query the scraper registry.

**Role:** `development`, `collection`, `admin`

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `status` | string | `active`, `paused`, `broken`, `testing` |
| `country_code` | string | ISO 3166-1 alpha-2 code |
| `listing_type` | string | `sale` or `rent` |
| `limit` | integer | Results per page (default: 50) |
| `offset` | integer | Pagination offset (default: 0) |

**Response (200):**

```json
{
  "success": true,
  "data": {
    "data": [
      {
        "config_id": "a9b8c7d6-...",
        "agency_name": "remax.pt",
        "country_code": "PT",
        "area_key": "Lisboa",
        "listing_type": "rent",
        "status": "active",
        "created_at": "2026-03-01T10:00:00Z",
        "last_run_at": "2026-03-25T06:00:00Z",
        "last_run_status": "success",
        "last_run_listings": 47,
        "failure_count": 0,
        "broken_at": null,
        "repair_count": 0,
        "config": { "currency_code": "EUR", ... }
      }
    ],
    "total": 12,
    "limit": 50,
    "offset": 0
  }
}
```

---

#### POST /api/scrapers/register

Register a new scraper in the system. The scraper is created with `status: "testing"`.

**Role:** `development`

**Request body:**

```json
{
  "agency_name": "remax.pt",
  "country_code": "PT",
  "area_key": "Lisboa",
  "listing_type": "rent",
  "config": {
    "currency_code": "EUR",
    "base_url": "https://remax.pt",
    "discovery_url": "https://remax.pt/arrendar/lisboa"
  }
}
```

**Response (201):** The full scraper registry row including the generated `config_id`.

---

#### PATCH /api/scrapers/{id}/run

Record the results of a scraper run. Creates a run receipt and updates the scraper's registry entry.

**Role:** `collection`

**Path parameters:**
- `id` (UUID) — The scraper config ID.

**Request body:**

```json
{
  "started_at": "2026-03-25T06:00:00Z",
  "completed_at": "2026-03-25T06:01:30Z",
  "status": "success",
  "urls_discovered": 120,
  "urls_new": 15,
  "listings_extracted": 15,
  "listings_submitted": 15,
  "listings_accepted": 14,
  "listings_rejected": 1
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `started_at` | datetime | Yes | When the run started |
| `completed_at` | datetime | Yes | When the run finished |
| `status` | string | Yes | `success`, `partial`, or `failure` |
| `failure_stage` | string | No | `discovery`, `extraction`, or `validation` (if failed) |
| `urls_discovered` | integer | No | Total URLs found during discovery |
| `urls_new` | integer | No | URLs not already in the database |
| `listings_extracted` | integer | No | Listings successfully extracted |
| `listings_submitted` | integer | No | Listings submitted to validation |
| `listings_accepted` | integer | No | Listings that passed validation |
| `listings_rejected` | integer | No | Listings that failed validation |
| `error_message` | string | No | Error details if the run failed |

**Automatic behaviors:**
- On `success`: resets `failure_count` to 0.
- On `partial` or `failure`: increments `failure_count`.
- After 3 consecutive failures: automatically sets scraper status to `broken`.

**Response (200):**

```json
{
  "success": true,
  "data": {
    "receipt_id": "...",
    "updated": true,
    "failure_count": 0
  }
}
```

---

#### PATCH /api/scrapers/{id}/status

Update a scraper's status. Use this to reactivate a repaired scraper.

**Role:** `development`, `admin`

**Path parameters:**
- `id` (UUID) — The scraper config ID.

**Request body:**

```json
{
  "status": "active"
}
```

**Valid values:** `active`, `paused`, `broken`, `testing`

**Automatic behaviors:**
- When changing from `broken` or `testing` to `active`: increments `repair_count` and resets `failure_count` to 0.

---

### Troubleshooting

#### GET /api/rejections

Query recent rejection records.

**Role:** `development`, `admin`

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `config_id` | UUID | Filter by scraper config |
| `mode` | string | `test` or `live` |
| `limit` | integer | Results per page (default: 50) |
| `offset` | integer | Pagination offset (default: 0) |

**Response (200):** Paginated list of rejection records, each containing the full `listing_data` that was submitted and the detailed validation errors.

```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "...",
        "config_id": "...",
        "mode": "test",
        "listing_data": { ... },
        "tier_1_errors": [ { "field": "...", "rule": "...", "value": "..." } ],
        "tier_2_errors": [],
        "tier_3_warnings": [],
        "created_at": "2026-03-25T14:30:00Z"
      }
    ],
    "total": 7,
    "limit": 50,
    "offset": 0
  }
}
```

**Retention:** Rejection records are automatically purged after 30 days.

---

#### GET /api/rejections/summary

Get aggregate rejection statistics.

**Role:** `development`, `collection`, `admin`

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `config_id` | UUID | Filter by scraper config |
| `since` | datetime | Only include rejections after this timestamp |

**Response (200):**

```json
{
  "success": true,
  "data": {
    "total": 42,
    "by_mode": { "test": 30, "live": 12 },
    "top_rejection_reasons": [
      { "rule": "price_plausible", "count": 15 },
      { "rule": "required_field", "count": 10 },
      { "rule": "valid_url", "count": 8 }
    ]
  }
}
```

---

#### GET /api/run-receipts

Query run receipts for recent scraper runs.

**Role:** `development`, `collection`, `admin`

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `config_id` | UUID | Filter by scraper config |
| `status` | string | `success`, `partial`, or `failure` |
| `limit` | integer | Results per page (default: 50) |
| `offset` | integer | Pagination offset (default: 0) |

**Response (200):** Paginated list of run receipts.

**Retention:** Run receipts are automatically purged after 90 days.

---

## Endpoint Summary

| Endpoint | Method | Role(s) | Purpose |
|---|---|---|---|
| `/api/validate/test` | POST | development | Validate without storing |
| `/api/validate/test-batch` | POST | development | Batch validate without storing |
| `/api/validate/replay/{id}` | POST | development | Re-validate a previous rejection |
| `/api/listings` | GET | development, collection, admin | Query stored listings |
| `/api/listings` | POST | collection | Validate + store a listing |
| `/api/listings/batch` | POST | collection | Batch validate + store |
| `/api/listings/check-urls` | POST | collection | Check URLs for duplicates |
| `/api/listings/{id}/price` | PATCH | collection | Update price (auto history) |
| `/api/listings/{id}/status` | PATCH | collection | Update listing status |
| `/api/geography/:country_code` | GET | development, collection | Browse admin region hierarchy |
| `/api/geography/:country_code/search` | GET | development, collection | Fuzzy-search for regions |
| `/api/scrapers` | GET | development, collection, admin | Query scraper registry |
| `/api/scrapers/register` | POST | development | Register a new scraper |
| `/api/scrapers/{id}/run` | PATCH | collection | Record run results |
| `/api/scrapers/{id}/status` | PATCH | development, admin | Update scraper status |
| `/api/rejections` | GET | development, admin | Query rejection records |
| `/api/rejections/summary` | GET | development, collection, admin | Rejection statistics |
| `/api/run-receipts` | GET | development, collection, admin | Query run receipts |
