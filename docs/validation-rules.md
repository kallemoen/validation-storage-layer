# Validation & Storage Layer — Validation Rules

Every listing submitted to the API passes through a 3-tier validation pipeline. Tiers are evaluated sequentially with short-circuiting: if Tier 1 fails, Tier 2 and 3 are skipped. If Tier 2 fails, Tier 3 is skipped.

---

## How it works

```
Input → Tier 1 (Schema) → Tier 2 (Semantic) → Tier 3 (Completeness) → Result
           ↓ fail              ↓ fail               ↓ warnings
        REJECTED            REJECTED         ACCEPTED_WITH_WARNINGS
```

**Statuses:**

| Status | Meaning | Stored in DB? |
|---|---|---|
| `accepted` | Passed all tiers, no warnings | Yes (live mode) |
| `accepted_with_warnings` | Passed Tier 1 and 2, has Tier 3 warnings | Yes (live mode) |
| `rejected` | Failed Tier 1 or Tier 2 | No |

---

## Tier 1 — Schema Validation (Hard Reject)

Does the listing conform to the data model? These check structural correctness.

| Rule | Field(s) | Check | Example error |
|---|---|---|---|
| `required_field` | `listing_id`, `source_url`, `config_id`, `listing_type`, `country_code`, `property_type`, `location_granularity`, `raw_data` | Field must be non-null | `{"field": "listing_id", "rule": "required_field", "value": null}` |
| `valid_uuid` | `listing_id`, `config_id` | Must be a valid UUID format | `{"field": "config_id", "rule": "valid_uuid", "value": "not-a-uuid", "expected": "UUID format (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)"}` |
| `valid_iso_country` | `country_code` | Must be a valid ISO 3166-1 alpha-2 code | `{"field": "country_code", "rule": "valid_iso_country", "value": "XX"}` |
| `valid_enum` | `listing_type`, `rent_period`, `listing_status`, `property_type`, `location_granularity` | Must be one of the allowed values (skips null/undefined) | `{"field": "listing_type", "rule": "valid_enum", "value": "lease", "expected": "One of: sale, rent"}` |
| `valid_type` | All fields | Must match the declared type (string, number, integer, object, array) | `{"field": "bedrooms", "rule": "valid_type", "value": "three", "expected": "integer"}` |
| `valid_url` | `source_url`, each item in `images` | Must be a parseable URL | `{"field": "images[2]", "rule": "valid_url", "value": "not-a-url"}` |
| `rent_period_required` | `rent_period` | Must be non-null when `listing_type` is `rent` | `{"field": "rent_period", "rule": "rent_period_required", "value": null}` |

### Expected field types

| Field | Expected type |
|---|---|
| `listing_id`, `source_url`, `config_id`, `listing_type`, `rent_period`, `country_code`, `admin_level_1`-`4`, `postal_code`, `address_line_1`-`2`, `location_granularity`, `price_currency_code`, `price_scraped_at`, `raw_room_description`, `property_type`, `property_subtype`, `raw_property_type`, `description` | string |
| `latitude`, `longitude`, `bathrooms`, `living_area_sqm`, `plot_area_sqm` | number |
| `price_amount`, `bedrooms`, `total_rooms` | integer |
| `images` | array |
| `raw_data` | object |

---

## Tier 2 — Semantic Validation (Hard Reject)

Does the data make sense? These catch extraction and normalization errors that produce structurally valid but logically wrong data.

| Rule | Field(s) | Check | Example error |
|---|---|---|---|
| `price_positive` | `price_amount` | If present, must be > 0 | `{"field": "price_amount", "rule": "price_positive", "value": -100}` |
| `price_plausible` | `price_amount` | If present, must be within configured range for the country + listing type + currency | `{"field": "price_amount", "rule": "price_plausible", "value": 1, "expected": "10000-5000000 (minor units) for PT:rent:monthly:EUR"}` |
| `currency_matches_config` | `price_currency_code` | Must match the `currency_code` in the scraper's config | `{"field": "price_currency_code", "rule": "currency_matches_config", "value": "USD", "expected": "EUR"}` |
| `room_range` | `bedrooms` | If present, must be 0-50 | `{"field": "bedrooms", "rule": "room_range", "value": 100, "expected": "0-50"}` |
| `room_range` | `bathrooms` | If present, must be 0-50 | `{"field": "bathrooms", "rule": "room_range", "value": 75, "expected": "0-50"}` |
| `area_range` | `living_area_sqm` | If present, must be 5-50,000 sqm | `{"field": "living_area_sqm", "rule": "area_range", "value": 100000, "expected": "5-50000 sqm"}` |
| `location_mode_exclusive` | `location_granularity`, `latitude`, `longitude`, `admin_level_*` | Coordinate mode (`coordinates`/`address`) must not include admin_level fields. Admin-level mode must not include lat/lng. | `{"field": "location_granularity", "rule": "location_mode_exclusive", "value": "coordinates", "detail": "location_granularity \"coordinates\" uses coordinate mode. Do not send admin_level_* fields..."}` |
| `coordinates_in_country` | `latitude`, `longitude` | If present, must fall within the bounding box of `country_code` | `{"field": "latitude", "rule": "coordinates_in_country", "value": 60.0, "expected": "36.96-42.15 for PT"}` |
| `price_currency_pair` | `price_amount`, `price_currency_code` | Both must be present or both must be null | `{"field": "price_currency_code", "rule": "price_currency_pair", "value": null, "detail": "price_amount and price_currency_code must both be present or both be null"}` |
| `country_supported` | `country_code` | Country must have geography data loaded. Skipped if geography lookup is not initialized. | `{"field": "country_code", "rule": "country_supported", "value": "DE", "expected": "Supported countries: PT", "detail": "Country DE is not yet supported. Listings can only be submitted for countries with geography data loaded."}` |
| `admin_levels_valid` | `admin_level_1` through `admin_level_N` | Each admin level value must match the reference data for the country. Validates parent hierarchy (e.g., admin_level_2 must be a child of the provided admin_level_1). Skipped if country has no geography data. | `{"field": "admin_level_2", "rule": "admin_levels_valid", "value": "Lisbona", "expected": "Valid Concelho for PT in Distrito \"Lisboa\"", "detail": "\"Lisbona\" not found. Did you mean \"Lisboa\"?"}` |

### Configured price ranges

Price ranges are defined per country, listing type, rent period, and currency. All values are in **minor units** (e.g., EUR cents).

| Key | Min | Max | Display range |
|---|---|---|---|
| `PT:sale:EUR` | 100,000 | 5,000,000,000 | 1,000 - 50,000,000 EUR |
| `PT:rent:monthly:EUR` | 10,000 | 5,000,000 | 100 - 50,000 EUR/month |
| `PT:rent:weekly:EUR` | 5,000 | 2,000,000 | 50 - 20,000 EUR/week |
| `PT:rent:daily:EUR` | 1,000 | 500,000 | 10 - 5,000 EUR/day |
| `ES:sale:EUR` | 100,000 | 10,000,000,000 | 1,000 - 100,000,000 EUR |
| `ES:rent:monthly:EUR` | 10,000 | 5,000,000 | 100 - 50,000 EUR/month |
| `FR:sale:EUR` | 100,000 | 10,000,000,000 | 1,000 - 100,000,000 EUR |
| `FR:rent:monthly:EUR` | 10,000 | 10,000,000 | 100 - 100,000 EUR/month |
| `GB:sale:GBP` | 100,000 | 10,000,000,000 | 1,000 - 100,000,000 GBP |
| `GB:rent:monthly:GBP` | 10,000 | 10,000,000 | 100 - 100,000 GBP/month |
| `US:sale:USD` | 100,000 | 100,000,000,000 | 1,000 - 1,000,000,000 USD |
| `US:rent:monthly:USD` | 10,000 | 10,000,000 | 100 - 100,000 USD/month |
| `BR:sale:BRL` | 1,000,000 | 50,000,000,000 | 10,000 - 500,000,000 BRL |
| `BR:rent:monthly:BRL` | 20,000 | 50,000,000 | 200 - 500,000 BRL/month |
| `AE:sale:AED` | 1,000,000 | 50,000,000,000 | 10,000 - 500,000,000 AED |
| `AE:rent:monthly:AED` | 50,000 | 100,000,000 | 500 - 1,000,000 AED/month |

If no range is configured for a country/type/currency combination, the `price_plausible` check is skipped.

### Configured country bounding boxes

Coordinates are validated against approximate bounding boxes. Currently configured:

| Country | Lat range | Lng range |
|---|---|---|
| PT | 36.96 - 42.15 | -9.50 - -6.19 |
| ES | 35.95 - 43.79 | -9.30 - 4.33 |
| FR | 41.36 - 51.09 | -5.14 - 9.56 |
| GB | 49.96 - 58.64 | -7.57 - 1.68 |
| DE | 47.27 - 55.06 | 5.87 - 15.04 |
| IT | 36.65 - 47.09 | 6.63 - 18.52 |
| US | 24.52 - 49.38 | -124.77 - -66.95 |
| BR | -33.75 - 5.27 | -73.99 - -34.79 |
| JP | 24.40 - 45.52 | 122.93 - 153.99 |
| AE | 22.63 - 26.08 | 51.58 - 56.38 |
| MA | 27.67 - 35.92 | -13.17 - -1.01 |
| NL | 50.75 - 53.47 | 3.36 - 7.21 |
| SE | 55.34 - 69.06 | 11.11 - 24.17 |
| NO | 57.98 - 71.19 | 4.65 - 31.17 |
| DK | 54.56 - 57.75 | 8.09 - 12.69 |

If no bounding box is configured for a country, the coordinates check is skipped.

---

## Tier 3 — Completeness Validation (Soft Warning)

Does the listing have enough data to be useful? These are **not** grounds for rejection — the listing is still stored — but they flag data quality issues.

| Rule | Field(s) | Check | Example warning |
|---|---|---|---|
| `minimum_completeness` | `price_amount`, `bedrooms`, `living_area_sqm`, `description`, `images` | At least 3 of these 5 fields must be non-null and non-empty | `{"field": "multiple", "rule": "minimum_completeness", "value": 2, "detail": "Only 2 of 5 key fields populated (price_amount, bedrooms). Recommend at least 3."}` |
| `location_minimum` | `admin_level_3` | Should have city-level location data | `{"field": "admin_level_3", "rule": "location_minimum", "value": null, "detail": "City-level location data (admin_level_3) recommended."}` |
| `has_images` | `images` | Should have at least one image URL | `{"field": "images", "rule": "has_images", "value": null, "detail": "Listing has no images."}` |
| `has_description` | `description` | Should have a non-empty description | `{"field": "description", "rule": "has_description", "value": null, "detail": "Listing has no description."}` |

---

## Validation Feedback Format

Every validation result includes detailed, field-level feedback:

```json
{
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
```

Each error/warning object:

| Field | Type | Description |
|---|---|---|
| `field` | string | Which field failed (e.g., `"price_amount"`, `"images[2]"`, `"multiple"`) |
| `rule` | string | Which rule failed (e.g., `"required_field"`, `"price_plausible"`) |
| `value` | any | The value that was provided |
| `expected` | string | What was expected (optional) |
| `detail` | string | Human-readable explanation (optional) |

---

## Adding New Rules

To add a new validation rule:

1. Create a file in `src/validation/rules/` that exports a `ValidationRule`:

```typescript
import type { ValidationRule } from '../../types/validation.js';

export const myNewRule: ValidationRule = {
  name: 'my_new_rule',
  check(input, context) {
    // Return [] if the check passes
    // Return [{ field, rule, value, expected? }] if it fails
    return [];
  },
};
```

2. Import and add it to the appropriate tier array in `src/validation/tier1-schema.ts`, `tier2-semantic.ts`, or `tier3-completeness.ts`.

No changes to the validation engine are required.

---

## Adding New Countries

To add price ranges for a new country, edit `src/validation/config/price-ranges.ts`:

```typescript
'XX:sale:XXX': { min: 100000, max: 5000000000 },
'XX:rent:monthly:XXX': { min: 10000, max: 5000000 },
```

To add coordinate bounding boxes, edit `src/validation/config/country-bounds.ts`:

```typescript
XX: { minLat: 0.0, maxLat: 0.0, minLng: 0.0, maxLng: 0.0 },
```

If no config exists for a country, the `price_plausible` and `coordinates_in_country` checks are simply skipped for that country.
