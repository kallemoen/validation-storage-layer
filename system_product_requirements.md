# Real Estate Scraper System — Product Requirements

# 1. Background and Purpose

In certain areas of the world, real estate markets are fragmented. Instead of one large listing site that holds most of the inventory, listings are spread across many smaller real estate agency websites. Searching through these sites is a high-friction activity.

To solve this, we are building a scraper system that can take any real estate agency website, find new listings, extract the relevant data, normalize it into a fixed format, and store it in a central database. The system is designed to be agent-operated — AI agents build and maintain the individual scrapers, while the platform provides the infrastructure, quality enforcement, and monitoring around them.

This document defines the full system architecture and the product requirements for each layer, such that a developer or AI agent can produce a complete technical plan from it.

---

# 2. System Architecture

## 2.1 Layers

### Development Layer

**Purpose:** Builds new scraper modules and repairs broken ones. Agents create the site-specific extraction and normalization logic that turns raw web pages into structured listing data.

**Owns:** Scraper modules (one per agency site). Each module is a self-contained, independently deployable unit that takes a URL + config and returns a `ListingInput` object.

### Collection Layer

**Purpose:** Orchestrates and monitors scraper execution. Reads the scraper registry, runs active scrapers on a schedule, passes their output to the Validation layer, tracks health, and flags broken scrapers. Contains no site-specific logic.

**Owns:** The orchestration schedule, run execution, deduplication, health monitoring, price monitoring, and run receipt creation.

### Validation Layer

**Purpose:** Enforces data quality. Every listing must pass through this layer before it can be stored. Returns detailed feedback on rejections so that Development and Collection layers can act on problems.

**Owns:** Validation rules (schema, semantic, completeness), rejection storage, and the gatekeeper logic that decides what enters the database.

### Storage Layer

**Purpose:** Stores valid listing data and backs it up. Single source of truth for all listing data, scraper registry entries, run receipts, and rejection records.

**Owns:** The database, backups, and data retention policies.

---

## 2.2 Contracts Between Layers

| From | To | What crosses the boundary |
|---|---|---|
| Development → Validation | Test listing submissions, rejection queries, run receipt queries, scraper registration, status updates | `ListingInput` (test mode), registry mutations, read queries |
| Development → Scraper Modules | Deployable extraction + normalization code | A module conforming to the scraper module interface |
| Collection → Scraper Modules | Listing URL + config | Returns `ListingInput` object or throws error |
| Collection → Validation | Live listing batches, duplicate checks, price updates, status updates, run receipts, registry updates | `ListingInput` (live mode), `RunReceipt`, registry mutations |
| Collection → Development | Broken scraper flag | Registry status set to `broken` (indirect, via registry) |
| Validation → Storage | Accepted listings, registry entries, run receipts, rejection records | Database writes (only path in) |
| All layers → Storage | Read queries | Listings, registry, receipts, rejections (via API, never direct) |

---

## 2.3 Design Principles

**Contract enforcement at every boundary.** Each layer defines what it accepts and what it produces. Data that doesn't conform is rejected with feedback. No layer trusts another's output — it validates what it receives.

**Scraper-agnostic infrastructure.** The Collection, Validation, and Storage layers contain zero site-specific logic. All site-specific behavior lives in the scraper modules, which are built and maintained by the Development layer.

**Observability by default.** Every pipeline run produces a run receipt. Every listing carries a trace. Rejection records store full context. This is not optional — it is how the system detects and recovers from problems.

**Agents own the variable parts, the platform owns the stable parts.** The data model, validation rules, pipeline orchestration, and storage are stable infrastructure. The scraper modules — which are the part that breaks most often — are owned by agents that can build, test, and repair them autonomously.

---

## 2.4 Build Order

The system is built from the inside out:

1. **Storage Layer + Data Model** — the database schema and tables.
2. **Validation Layer + API** — the quality gatekeeper, contracts, and the sole path to the database.
3. **Collection Layer** — the orchestrator that runs scrapers and tracks health.
4. **First scraper module** (remax.pt, Lisboa, rentals) — proves the full pipeline works end to end.
5. **Development Layer** — agent tooling for building and repairing scraper modules.

Each step validates the one before it. The Validation layer can be tested with hand-crafted listings before any scraper exists. The Collection layer can be tested with a single scraper before the Development layer is built. The Development layer is the last piece because it automates what you've already done manually.

---

# 3. Validation & Storage Layer — Product Requirements

## 3.1 Purpose

The Validation and Storage layer is the quality gatekeeper of the scraper system. Every listing — whether from a scraper being tested in development or a live production run — must pass through this layer before it can be stored in the database.

It serves three purposes:

1. **Enforce data quality.** Every listing is validated against a set of rules before it can be written to the database. This ensures that no malformed, implausible, or incomplete data enters the system, regardless of which scraper produced it.
2. **Provide actionable feedback.** When data fails validation, the layer returns detailed, field-level feedback explaining what went wrong. This feedback is what allows scraper-building agents to iterate during development and troubleshooting agents to diagnose and repair broken scrapers.
3. **Store valid data reliably.** Listings that pass validation are persisted to the database, backed up, and made available for downstream consumers. The database is the single source of truth for all listing data.

No other part of the system has direct write access to the database. This layer is the only path in.

---

## 3.2 Functional Requirements

### As a scraper-building agent, I can…

- **Submit test listings for validation without writing to the database**, so that I can iterate on my extraction and normalization logic until it produces data that passes all validation rules.
- **Receive detailed, field-level feedback on why a listing was rejected**, including which validation tier failed, which specific fields were problematic, what value was provided, and what was expected — so that I know exactly what to fix.
- **Submit test listings in batches**, so that I can validate multiple sample listings in a single request and assess whether my scraper works across a variety of listing pages.
- **Receive an aggregate summary of batch test results**, including how many passed, how many failed, and the most common failure reasons — so that I can quickly gauge overall scraper quality without inspecting every individual result.
- **Register a new scraper in the system when it passes testing**, so that the Collection layer can pick it up and start running it.
- **Read stored listings from the database**, so that I can reference existing data when building extraction logic for a new site in the same market.
- **Query the scraper registry to see all scrapers and their current status**, so that I understand the landscape of what's already been built.

### As a scraper pipeline, I can…

- **Submit live listings for validation and storage in a single operation**, so that accepted listings are written to the database without a separate write step.
- **Submit live listings in batches**, so that I can process an entire scraper run efficiently.
- **Receive per-listing pass/fail results and a batch-level summary**, so that I can update the scraper registry with accurate run statistics and determine whether a scraper should be flagged as broken.
- **Check a list of URLs against the database to identify duplicates**, so that I can skip listings that have already been scraped and stored, without querying the full listing data.
- **Update the price on an existing listing**, so that I can record price changes detected during re-scraping. The system should automatically preserve the previous price in the listing's price history.
- **Update the status of an existing listing** (e.g., mark as sold, delisted, or expired), so that the database reflects the current state of listings detected during maintenance runs.
- **Update a scraper's registry entry with run results** (last run time, status, listing count, failure count), so that the registry accurately reflects scraper health and the system can detect broken scrapers.
- **Read from the scraper registry to determine which scrapers are active**, so that I know which scrapers to run on each scheduled execution.

### As a troubleshooting agent, I can…

- **Read recent rejection records for a specific scraper**, including the full listing data that was submitted and the detailed validation feedback — so that I can see exactly what the scraper produced and why it was rejected.
- **Read an aggregate summary of rejections for a scraper over a time period**, so that I can quickly understand the scale and pattern of failures without reading every individual rejection.
- **Read run receipts for a scraper's recent runs**, including which pipeline stage failed (discovery, extraction, or validation), how many URLs were discovered, how many listings were extracted, and how many passed validation — so that I can pinpoint where in the pipeline the problem is occurring.
- **Replay previously rejected listings through validation in test mode**, so that I can verify a fix works against the exact data that failed, without needing to re-scrape the source site.
- **Read the scraper's config from the registry**, so that I have full context about the scraper's settings, discovery URLs, and market configuration.
- **Read stored listings for the same scraper**, so that I can compare what the scraper used to produce successfully against what it's producing now.
- **Set a repaired scraper's status back to active**, so that the repair loop can complete autonomously without requiring manual intervention. This is restricted to scrapers that are currently in a broken or testing state.
- **Submit test listings to validate a fix before reactivating a scraper**, using the same test mode as the scraper-building agent — so that I can confirm the repair works before the scraper goes live again.

### Note on future user groups
The system as specified covers data production — scraping, validation, and storage. It does not yet specify the consumer-facing applications that will be built on top of this data, such as a web application for users to browse and search listings, or AI agents that can answer questions about the market, recommend listings, or summarize trends.

These applications are read-only consumers of the listing database. They do not write data, modify the pipeline, or interact with the scraping infrastructure. The architecture supports adding them at any time without changes to the existing layers — they would connect through the Validation & Storage API with a read-only role, or through a separate read-optimized API layer if consumer query patterns (full-text search, geo-radius queries, aggregations) require it.

No schema changes are anticipated. The data model already supports common consumer use cases: display coordinates enable map rendering, normalized fields enable search and filtering, price history enables timeline views, and raw descriptions and images are stored ready for display.

**One implementation consideration:** the database technology chosen for the Storage layer should support full-text search, geospatial queries (e.g., PostGIS), and aggregations, since these will be required by consumer applications even though the scraping pipeline does not need them. This should be factored into the technical plan now to avoid a costly migration later.

---

## 3.3 Validation Rules

Rules are organized in three tiers:

### Tier 1 — Schema validation (hard reject)

Does the listing conform to the data model? Correct types, required fields present, values within allowed enums. These are hard failures — a listing that fails schema validation is structurally broken.

| Rule | Field(s) | Check |
|---|---|---|
| `required_field` | `listing_id`, `source_url`, `config_id`, `listing_type`, `country_code`, `property_type`, `display_latitude`, `display_longitude`, `location_granularity`, `raw_data` | Field must be non-null. |
| `valid_uuid` | `listing_id`, `config_id` | Must be a valid UUID format. |
| `valid_iso_country` | `country_code` | Must be a valid ISO 3166-1 alpha-2 code. |
| `valid_enum` | `listing_type`, `listing_status`, `property_type`, `rent_period`, `location_granularity` | Must be one of the allowed values. |
| `valid_type` | All fields | Must match the declared type (e.g., `price_amount` is an integer, `bathrooms` is a number). |
| `valid_url` | `source_url`, items in `images` | Must be a valid URL format. |
| `rent_period_required` | `rent_period` | Must be non-null when `listing_type` is `rent`. |

### Tier 2 — Semantic validation (hard reject)

Does the data make sense? These catch extraction and normalization errors that produce structurally valid but logically wrong data.

| Rule | Field(s) | Check |
|---|---|---|
| `price_positive` | `price_amount` | If present, must be greater than 0. |
| `price_plausible` | `price_amount` | If present, must be within a configurable range per country and listing type. |
| `currency_matches_config` | `price_currency_code` | Must match the currency defined in the scraper's config. |
| `bedrooms_range` | `bedrooms` | If present, must be between 0 and 50. |
| `bathrooms_range` | `bathrooms` | If present, must be between 0 and 50. |
| `area_range` | `living_area_sqm` | If present, must be between 5 and 50,000 sqm. |
| `coordinates_in_country` | `latitude`, `longitude` | If present, must fall within the bounding box of `country_code`. |
| `display_coordinates_in_country` | `display_latitude`, `display_longitude` | Must fall within the bounding box of `country_code`. |
| `price_currency_pair` | `price_amount`, `price_currency_code` | Both must be present or both must be null. |

### Tier 3 — Completeness validation (soft warning)

Does the listing have enough data to be useful? These are soft failures — the listing may still be stored but tagged as incomplete.

| Rule | Field(s) | Check |
|---|---|---|
| `minimum_completeness` | Multiple | At least 3 of: `price_amount`, `bedrooms`, `living_area_sqm`, `description`, `images` must be non-null. |
| `location_minimum` | `admin_level_3` | Should have at least city-level location data. |
| `has_images` | `images` | Should have at least one image URL. |
| `has_description` | `description` | Should have a non-empty description. |

---

## 3.4 Feedback Format

Every submission returns a result object:

| Field | Type | Example | Comment |
|---|---|---|---|
| `status` | `STRING` | `accepted` | One of: `accepted`, `rejected`, `accepted_with_warnings`. |
| `listing_id` | `UUID` | `a1b2c3d4-...` | The listing that was evaluated. |
| `config_id` | `UUID` | `x9y8z7-...` | The scraper that produced this listing. |
| `mode` | `STRING` | `live` | `test` or `live`. |
| `tier_1_errors` | `OBJECT[]` | `[{"field": "country_code", "rule": "invalid_iso_code", "value": "XX"}]` | Schema violations. Any tier 1 error means rejection. |
| `tier_2_errors` | `OBJECT[]` | `[{"field": "price_amount", "rule": "out_of_range", "value": 5, "expected": "100000-50000000"}]` | Semantic violations. Any tier 2 error means rejection. |
| `tier_3_warnings` | `OBJECT[]` | `[{"rule": "low_completeness", "detail": "only 2 of 8 fields populated"}]` | Completeness warnings. Listing may still be accepted but tagged. |
| `evaluated_at` | `TIMESTAMP` | `2026-03-24T14:30:00Z` | When validation ran. |

Batch submissions additionally return an aggregate summary:

| Field | Type | Example | Comment |
|---|---|---|---|
| `config_id` | `UUID` | `x9y8z7-...` | Which scraper this batch came from. |
| `total_submitted` | `INTEGER` | `50` | Total listings in the batch. |
| `accepted` | `INTEGER` | `35` | Passed all tiers. |
| `accepted_with_warnings` | `INTEGER` | `8` | Passed tier 1 and 2 but has tier 3 warnings. |
| `rejected` | `INTEGER` | `7` | Failed tier 1 or tier 2. |
| `top_rejection_reasons` | `OBJECT[]` | `[{"rule": "price_out_of_range", "count": 4}]` | Most common failure reasons in this batch. |

---

## 3.5 Non-functional Requirements

### Latency

Single listing validation and write should complete in under 200ms. Batch operations of 50 listings should complete in under 2 seconds. These targets apply to the full validation and storage path — from receiving the request to returning the response with the listing persisted.

### Availability

99.9% uptime. The Validation and Storage layer is on the critical path for all data ingestion. If it goes down, no scrapers can store data, no test submissions can be validated, and no troubleshooting can occur. Downtime cascades to all other layers.

### Idempotency

`submitListing` in live mode with a `source_url` that already exists should return a duplicate error rather than creating a second listing. This prevents the same listing from being stored twice if a scraper run is retried or if deduplication in the Collection layer missed it.

`updateListingPrice` with an unchanged price should not create a new price history entry. It should only update the `price_scraped_at` timestamp to record that the price was observed again. This prevents the price history from filling with identical entries on every re-scrape.

### Data Retention

Rejection records are diagnostic data, not permanent records. They are retained for 30 days and then automatically purged. This provides enough history for troubleshooting while keeping storage costs bounded.

Run receipts are retained for 90 days. They provide longer-term operational visibility into scraper performance trends.

### Authorization

Each consuming layer has a defined role with specific permissions. The system enforces these at the API level:

| Role | Description | Permissions |
|---|---|---|
| `development` | Used by Development layer agents. | Submit test listings. Read rejections. Read stored listings (read-only). Read scraper registry. Register scrapers. Set broken/testing scrapers to active. |
| `collection` | Used by Collection layer / Orchestrator. | Submit live listings. Read rejections (aggregate only). Check for duplicate URLs. Read stored listings. Update scraper registry (run status). Update prices and listing statuses. |
| `admin` | Used by the owner / dashboard. | All read operations. Manage scraper registry (activate, pause, deactivate). Cannot submit listings. |

### Data Integrity

The database is the single source of truth. All writes go through the Validation layer. No direct database access is permitted from any other layer. Backups are performed on a schedule sufficient to meet recovery objectives — the specific RPO and RTO should be defined during implementation.

### Stack to build with

We already use Vercel and Supabase, so we should use that for building this system and make it easy to run. 

---

# 4. Data Model

## 4.1 Introduction

This section defines the data model for property listings stored in the database. It is the contract that the Validation layer enforces — every field, type, and constraint described here is what "valid" means.

The core challenge is that real estate data is not standardized globally. Countries structure addresses differently, count rooms differently, classify property types differently, use different currencies, and provide varying levels of detail. Rather than forcing every listing into a single rigid schema, this model takes a pragmatic approach: normalize what can be reasonably compared across markets into a small set of common fields, and preserve everything else as raw source data so no information is lost.

---

## 4.2 Listing — Metadata

### Assumptions

1. **Every listing has a unique internal ID.** A UUID serves as the primary key, decoupled from the source URL. This handles edge cases like the same property appearing on multiple agency sites, or a source URL changing format.
2. **The source URL and config are tracked.** These link the listing back to where it came from and which scraper config produced it. Essential for debugging and re-scraping.
3. **Timestamps track lifecycle.** `created_at` records when the listing first entered the database. `updated_at` records the last time any field was modified (price change, re-scrape, backfill, etc.).
4. **Listing status reflects the current state.** Listings are `active` by default. Status changes to `sold`, `delisted`, or `expired` based on subsequent scrapes or detection logic.
5. **Listing type distinguishes sales from rentals.** Every listing is either a sale or a rental. This is typically inherited from the config rather than extracted per listing.
6. **Rent period is required for rentals.** When `listing_type` is `rent`, the `rent_period` field specifies whether the price is monthly, weekly, or daily.

### Field Reference

| Field | Type | Nullable | Example | Comment |
|---|---|---|---|---|
| `listing_id` | `UUID` (PK) | No | `a1b2c3d4-e5f6-7890-abcd-ef1234567890` | Internal unique identifier. Generated at creation time. |
| `source_url` | `VARCHAR(2000)` | No | `https://remax.pt/listing/12345` | The URL the listing was scraped from. |
| `config_id` | `UUID` (FK) | No | `x9y8z7w6-...` | References the scraper config that discovered this listing. |
| `listing_type` | `VARCHAR(20)` | No | `rent` | One of: `sale`, `rent`. |
| `rent_period` | `VARCHAR(20)` | Yes | `monthly` | One of: `monthly`, `weekly`, `daily`. Required when `listing_type` is `rent`. Null when `sale`. |
| `listing_status` | `VARCHAR(20)` | No | `active` | One of: `active`, `sold`, `delisted`, `expired`. Defaults to `active`. |
| `created_at` | `TIMESTAMP` | No | `2026-03-24T14:30:00Z` | When first stored. Set once, never modified. |
| `updated_at` | `TIMESTAMP` | No | `2026-03-24T14:30:00Z` | Last time any field was modified. |

---

## 4.3 Listing — Location

### Assumptions

1. **No universal administrative hierarchy exists.** The schema uses generic `admin_level_N` fields rather than named tiers like "state" or "county."
2. **Not all levels will be populated.** Some countries have fewer administrative layers.
3. **Postal codes are optional and vary in format.** A nullable `VARCHAR(20)` covers all known formats.
4. **Street addressing is not standardized globally.** The `address_line` fields store the address as locally formatted free text.
5. **Coordinates are not always available from the source.** All location fields except `country_code` are nullable.
6. **Data is enriched top-down from the most granular value available.** The pipeline back-fills using geocoding or boundary lookups but never fabricates data more granular than what was provided.
7. **A display coordinate is always generated.** For map rendering. Exact when known, random within the most granular boundary when not.
8. **A granularity field records how precise the location actually is.**

### Field Reference

| Field | Type | Nullable | Example | Comment |
|---|---|---|---|---|
| `country_code` | `CHAR(2)` | No | `PT` | ISO 3166-1 alpha-2 code. |
| `admin_level_1` | `VARCHAR(255)` | Yes | `Lisboa` | Top-level subdivision. |
| `admin_level_2` | `VARCHAR(255)` | Yes | `Lisboa` | Second-level subdivision. |
| `admin_level_3` | `VARCHAR(255)` | Yes | `Lisboa` | City, municipality, commune. |
| `admin_level_4` | `VARCHAR(255)` | Yes | `Santo António` | Neighborhood, suburb, ward. |
| `postal_code` | `VARCHAR(20)` | Yes | `1150-123` | Local format. |
| `address_line_1` | `VARCHAR(500)` | Yes | `Rua da Alegria 45` | Primary street address. |
| `address_line_2` | `VARCHAR(500)` | Yes | `3o Andar` | Secondary address line. |
| `latitude` | `DECIMAL(9,6)` | Yes | `38.717400` | Actual property coordinates. Null if not provided. |
| `longitude` | `DECIMAL(9,6)` | Yes | `-9.145300` | Actual property coordinates. Null if not provided. |
| `display_latitude` | `DECIMAL(9,6)` | No | `38.719100` | Always populated. For map rendering. |
| `display_longitude` | `DECIMAL(9,6)` | No | `-9.143800` | Always populated. |
| `location_granularity` | `VARCHAR(20)` | No | `admin_level_4` | One of: `coordinates`, `address`, `postal_code`, `admin_level_4`, `admin_level_3`, `admin_level_2`, `admin_level_1`, `country`. |

### Enrichment Pipeline

| Source has… | Back-fill action | `location_granularity` |
|---|---|---|
| Exact coordinates | Reverse-geocode to fill all admin levels, postal code, and address. Display coords = exact coords. | `coordinates` |
| Street address (no coords) | Forward-geocode to get coords → then reverse-geocode to fill admin levels. Display coords = geocoded coords. | `address` |
| Postal code (no address) | Look up postal code → fill admin levels upward. Display coords = random point within postal code polygon. | `postal_code` |
| `admin_level_4` only | Resolve boundary → fill parent levels. Display coords = random point within neighborhood polygon. | `admin_level_4` |
| `admin_level_3` only | Resolve boundary → fill parent levels. Display coords = random point within city polygon. | `admin_level_3` |
| `admin_level_2` only | Resolve boundary → fill parent levels. Display coords = random point within county/department polygon. | `admin_level_2` |
| `admin_level_1` only | Resolve boundary → fill country. Display coords = random point within region polygon. | `admin_level_1` |
| Country only | No further enrichment possible. Display coords = random point within country polygon. | `country` |

**Key rule:** the pipeline never fabricates data at a level more granular than what was provided.

### Mapping Admin Levels by Country (examples)

| Country | `admin_level_1` | `admin_level_2` | `admin_level_3` | `admin_level_4` |
|---|---|---|---|---|
| US | State | County | City | Neighborhood |
| UK | Country (England…) | County | City/Town | Ward |
| France | Région | Département | Commune | Quartier |
| Japan | Prefecture | — | City | Ward (区) |
| Brazil | State | — | Municipality | District |
| UAE | Emirate | — | City | Area/Zone |
| Portugal | Distrito | Concelho | Freguesia | Localidade |

---

## 4.4 Listing — Pricing

### Assumptions

1. **Price is nullable.** A null `price_amount` means "price on request" or undisclosed.
2. **Prices change over time.** Current price in dedicated fields, previous observations in a `price_history` JSON array.
3. **Any currency is supported.** ISO 4217 codes, paired with a currencies lookup table.
4. **Amounts are stored as integers in minor units.** Avoids floating-point precision issues.
5. **Currency is defined at the config level.** The listing inherits it.

### Field Reference

| Field | Type | Nullable | Example | Comment |
|---|---|---|---|---|
| `price_amount` | `BIGINT` | Yes | `170000` | Current price in minor units. Null = price on request. |
| `price_currency_code` | `CHAR(3)` | Yes | `EUR` | ISO 4217 code. Null when `price_amount` is null. |
| `price_scraped_at` | `TIMESTAMP` | Yes | `2026-03-24T14:30:00Z` | When current price was harvested. |
| `price_history` | `JSON` | Yes | `[{"amount": 180000, "currency_code": "EUR", "scraped_at": "2026-03-01T10:00:00Z"}]` | Previous price observations. |

### `currencies` Lookup Table

| Field | Type | Nullable | Example | Comment |
|---|---|---|---|---|
| `code` | `CHAR(3)` (PK) | No | `EUR` | ISO 4217 code. |
| `name` | `VARCHAR(100)` | No | `Euro` | Human-readable name. |
| `symbol` | `VARCHAR(5)` | No | `€` | Display symbol. |
| `minor_units` | `SMALLINT` | No | `2` | Divide `price_amount` by `10^minor_units` for display. |

### Price Update Workflow

When a listing is re-scraped and the price has changed: push current values into `price_history`, overwrite current price fields with new values. When unchanged, only update `price_scraped_at`.

---

## 4.5 Listing — Rooms & Size

### Assumptions

1. **No universal room taxonomy exists.** The schema does not force one taxonomy.
2. **We normalize what we can, preserve what we can't.** Three common fields plus `raw_room_description`.
3. **All room fields are nullable.** We store what the source gives us.
4. **Bathroom counting varies.** `DECIMAL(3,1)` supports half-bath conventions.
5. **Area is stored in square meters.** Converted from local units at scrape time.
6. **Plot/land area is separate from living area.**

### Field Reference

| Field | Type | Nullable | Example (US) | Example (France) | Example (Japan) | Comment |
|---|---|---|---|---|---|---|
| `bedrooms` | `SMALLINT` | Yes | `3` | `2` | `3` | Null if source doesn't distinguish bedrooms. |
| `bathrooms` | `DECIMAL(3,1)` | Yes | `2.5` | `null` | `1.0` | Supports half-baths. |
| `total_rooms` | `SMALLINT` | Yes | `null` | `3` | `null` | As defined by local market. |
| `living_area_sqm` | `DECIMAL(10,2)` | Yes | `185.80` | `75.00` | `65.50` | In square meters. |
| `plot_area_sqm` | `DECIMAL(12,2)` | Yes | `450.00` | `null` | `null` | Land/plot size. |
| `raw_room_description` | `VARCHAR(500)` | Yes | `3 bed, 2.5 bath` | `3 pièces` | `3LDK` | Exact source text. |

### Normalization Examples

| Source text | `bedrooms` | `bathrooms` | `total_rooms` | `raw_room_description` |
|---|---|---|---|---|
| `3 bed, 2.5 bath` (US) | `3` | `2.5` | `null` | `3 bed, 2.5 bath` |
| `3 pièces` (France) | `null` | `null` | `3` | `3 pièces` |
| `2 chambres, 3 pièces` (France) | `2` | `null` | `3` | `2 chambres, 3 pièces` |
| `3LDK` (Japan) | `3` | `null` | `null` | `3LDK` |
| `4 bed, 2 reception` (UK) | `4` | `null` | `6` | `4 bed, 2 reception` |
| `3 ambientes` (Argentina) | `null` | `null` | `3` | `3 ambientes` |
| `4 bed, 3 bath, 2 car` (Australia) | `4` | `3.0` | `null` | `4 bed, 3 bath, 2 car` |

---

## 4.6 Listing — Property Type

### Assumptions

1. **Two-tier classification.** Fixed `property_type` enum for cross-market filtering, free-form `property_subtype` for local detail.
2. **Enum values:** `house`, `apartment`, `land`, `commercial`, `mixed_use`, `parking`, `other`.
3. **Subtypes are market-specific.** Not enumerated.
4. **Raw source text is always preserved.**
5. **Unknown types default to `other`.**

### Field Reference

| Field | Type | Nullable | Example (US) | Example (UK) | Example (France) | Comment |
|---|---|---|---|---|---|---|
| `property_type` | `VARCHAR(20)` | No | `house` | `house` | `apartment` | From the fixed enum. Defaults to `other`. |
| `property_subtype` | `VARCHAR(100)` | Yes | `single_family` | `semi_detached` | `studio` | Market-specific. |
| `raw_property_type` | `VARCHAR(500)` | Yes | `Single Family Home` | `Semi-Detached House` | `Studio` | Exact source text. |

### Mapping Examples

| Source text | `property_type` | `property_subtype` | `raw_property_type` |
|---|---|---|---|
| `Single Family Home` (US) | `house` | `single_family` | `Single Family Home` |
| `Condo` (US) | `apartment` | `condo` | `Condo` |
| `Semi-Detached House` (UK) | `house` | `semi_detached` | `Semi-Detached House` |
| `Appartement` (France) | `apartment` | `null` | `Appartement` |
| `Terrain constructible` (France) | `land` | `buildable` | `Terrain constructible` |
| `3LDK Mansion` (Japan) | `apartment` | `mansion` | `3LDK Mansion` |
| `Riad` (Morocco) | `house` | `riad` | `Riad` |
| `Retail Unit` (UK) | `commercial` | `retail` | `Retail Unit` |
| `Mixed Use Building` (US) | `mixed_use` | `null` | `Mixed Use Building` |
| `Garage` (France) | `parking` | `garage` | `Garage` |
| `Fazenda` (Brazil) | `land` | `farm` | `Fazenda` |
| `Unknown type XYZ` | `other` | `null` | `Unknown type XYZ` |

---

## 4.7 Listing — Description

| Field | Type | Nullable | Example | Comment |
|---|---|---|---|---|
| `description` | `TEXT` | Yes | `Apartamento T1, no Centro de Lisboa...` | Raw description text. Any language, any length. |

---

## 4.8 Listing — Images

| Field | Type | Nullable | Example | Comment |
|---|---|---|---|---|
| `images` | `JSON` | Yes | `["https://example.com/img/1.jpg", ...]` | Ordered array of URLs. First entry is the hero image. |

---

## 4.9 Listing — Raw Data

| Field | Type | Nullable | Example | Comment |
|---|---|---|---|---|
| `raw_data` | `JSONB` | No | `{"price": "1 700 €/ Mensal", "type": "Apartamento T1", ...}` | Complete raw extraction output. Write-once. Structure varies per source. |

---

# 5. Scraper Registry Schema

The scraper registry tracks every scraper in the system and its operational state.

| Field | Type | Nullable | Example | Comment |
|---|---|---|---|---|
| `config_id` | `UUID` (PK) | No | `a1b2c3d4-...` | Unique identifier. |
| `agency_name` | `VARCHAR(255)` | No | `remax.pt` | Human-readable name. |
| `country_code` | `CHAR(2)` | No | `PT` | Market this scraper covers. |
| `area_key` | `VARCHAR(255)` | No | `Lisboa` | Area within the market. |
| `listing_type` | `VARCHAR(20)` | No | `rent` | `sale` or `rent`. |
| `status` | `VARCHAR(20)` | No | `active` | `active`, `paused`, `broken`, `testing`. |
| `created_at` | `TIMESTAMP` | No | `2026-03-01T10:00:00Z` | When first registered. |
| `last_run_at` | `TIMESTAMP` | Yes | `2026-03-24T06:00:00Z` | Last time run. Null if never. |
| `last_run_status` | `VARCHAR(20)` | Yes | `success` | `success`, `partial`, `failure`. |
| `last_run_listings` | `INTEGER` | Yes | `47` | Listings accepted on last run. |
| `failure_count` | `SMALLINT` | No | `0` | Consecutive failed runs. Resets on success. |
| `broken_at` | `TIMESTAMP` | Yes | `null` | When flagged broken. |
| `repair_count` | `SMALLINT` | No | `0` | Total repairs by Development layer. |
| `config` | `JSONB` | No | `{...}` | Full scraper config. |

---

# 6. Operational Data Schemas

## 6.1 Run Receipts

Created by the Collection layer for every scraper execution. Retention: 90 days.

| Field | Type | Nullable | Example | Comment |
|---|---|---|---|---|
| `id` | `UUID` (PK) | No | `r1s2t3u4-...` | Unique identifier. |
| `config_id` | `UUID` (FK) | No | `a1b2c3d4-...` | Which scraper was run. |
| `started_at` | `TIMESTAMP` | No | `2026-03-24T06:00:00Z` | Run start. |
| `completed_at` | `TIMESTAMP` | No | `2026-03-24T06:02:34Z` | Run end. |
| `status` | `VARCHAR(20)` | No | `success` | `success`, `partial`, `failure`. |
| `failure_stage` | `VARCHAR(20)` | Yes | `null` | `discovery`, `extraction`, `validation`, or null. |
| `urls_discovered` | `INTEGER` | Yes | `200` | Total URLs found. |
| `urls_new` | `INTEGER` | Yes | `47` | After deduplication. |
| `listings_extracted` | `INTEGER` | Yes | `47` | Successfully extracted. |
| `listings_submitted` | `INTEGER` | Yes | `47` | Submitted to Validation. |
| `listings_accepted` | `INTEGER` | Yes | `45` | Passed validation. |
| `listings_rejected` | `INTEGER` | Yes | `2` | Failed validation. |
| `error_message` | `TEXT` | Yes | `null` | Top-level error if run failed entirely. |

## 6.2 Rejection Records

Created by the Validation layer on rejection. Retention: 30 days.

| Field | Type | Nullable | Example | Comment |
|---|---|---|---|---|
| `id` | `UUID` (PK) | No | `j1k2l3m4-...` | Unique identifier. |
| `config_id` | `UUID` (FK) | No | `a1b2c3d4-...` | Which scraper produced this. |
| `mode` | `VARCHAR(10)` | No | `live` | `test` or `live`. |
| `listing_data` | `JSONB` | No | `{...}` | Full submitted listing data. |
| `tier_1_errors` | `JSONB` | No | `[{"field": "price_amount", "rule": "valid_type", "value": "Sob consulta"}]` | Schema errors. |
| `tier_2_errors` | `JSONB` | No | `[]` | Semantic errors. |
| `tier_3_warnings` | `JSONB` | No | `[]` | Completeness warnings. |
| `created_at` | `TIMESTAMP` | No | `2026-03-24T14:30:00Z` | When rejected. |
