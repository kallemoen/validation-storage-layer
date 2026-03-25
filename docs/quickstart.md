# Validation & Storage Layer — Quickstart Guide

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_JWT_SECRET=your-jwt-secret
MAPBOX_ACCESS_TOKEN=pk.eyJ...   # Optional, for location enrichment
```

### 3. Run database migrations

Apply the migrations to your Supabase project:

```bash
npx supabase db push
```

Or apply them manually in the Supabase SQL editor. The migrations are in `supabase/migrations/` and must be run in order (00001 through 00009).

### 4. Run locally

```bash
npm run dev
```

This starts the Vercel dev server. The API is available at `http://localhost:3000/api/`.

### 5. Deploy

```bash
vercel deploy
```

---

## Creating API Keys

API consumers authenticate with JWTs that contain an `app_role` claim. To create a key:

1. Choose the appropriate role: `development`, `collection`, or `admin`.
2. Generate a JWT signed with your `SUPABASE_JWT_SECRET` (HS256) containing:

```json
{
  "app_role": "development",
  "iat": 1711360000,
  "exp": 1742896000
}
```

You can generate test tokens with:

```bash
node -e "
const jose = require('jose');
const secret = new TextEncoder().encode('your-jwt-secret');
jose.new SignJWT({ app_role: 'development' })
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuedAt()
  .setExpirationTime('1y')
  .sign(secret)
  .then(console.log);
"
```

---

## Workflow: Building a New Scraper

### Step 1: Register the scraper

```bash
curl -X POST https://your-api.vercel.app/api/scrapers/register \
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

Save the returned `config_id` — you'll need it for all subsequent calls.

### Step 2: Test your scraper output

Submit listings in test mode to iterate on your extraction logic:

```bash
curl -X POST https://your-api.vercel.app/api/validate/test \
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

If rejected, the response tells you exactly what's wrong:

```json
{
  "status": "rejected",
  "tier_1_errors": [
    { "field": "country_code", "rule": "valid_iso_country", "value": "XX" }
  ]
}
```

### Step 3: Batch test

Once individual listings pass, test a batch:

```bash
curl -X POST https://your-api.vercel.app/api/validate/test-batch \
  -H "Authorization: Bearer $DEV_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "listings": [ {...}, {...}, {...} ] }'
```

Check the `summary` to see your overall pass rate.

### Step 4: Activate the scraper

Once satisfied with test results, update the scraper status to `active`:

```bash
curl -X PATCH https://your-api.vercel.app/api/scrapers/YOUR_CONFIG_ID/status \
  -H "Authorization: Bearer $DEV_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "status": "active" }'
```

---

## Workflow: Collection Layer (Live Ingestion)

### Submit listings

```bash
curl -X POST https://your-api.vercel.app/api/listings \
  -H "Authorization: Bearer $COLLECTION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "listing_id": "...", "source_url": "...", ... }'
```

### Submit batch

```bash
curl -X POST https://your-api.vercel.app/api/listings/batch \
  -H "Authorization: Bearer $COLLECTION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "listings": [ {...}, {...} ] }'
```

### Check for duplicates before scraping

```bash
curl -X POST https://your-api.vercel.app/api/listings/check-urls \
  -H "Authorization: Bearer $COLLECTION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "urls": ["https://remax.pt/listing/12345", "https://remax.pt/listing/67890"] }'
```

### Update prices

```bash
curl -X PATCH https://your-api.vercel.app/api/listings/LISTING_ID/price \
  -H "Authorization: Bearer $COLLECTION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "price_amount": 165000, "price_currency_code": "EUR" }'
```

### Record run results

```bash
curl -X PATCH https://your-api.vercel.app/api/scrapers/CONFIG_ID/run \
  -H "Authorization: Bearer $COLLECTION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "started_at": "2026-03-25T06:00:00Z",
    "completed_at": "2026-03-25T06:01:30Z",
    "status": "success",
    "listings_accepted": 14,
    "listings_rejected": 1
  }'
```

---

## Workflow: Troubleshooting a Broken Scraper

### Check what's failing

```bash
# See recent rejections for a scraper
curl "https://your-api.vercel.app/api/rejections?config_id=CONFIG_ID" \
  -H "Authorization: Bearer $DEV_TOKEN"

# Get aggregate failure stats
curl "https://your-api.vercel.app/api/rejections/summary?config_id=CONFIG_ID" \
  -H "Authorization: Bearer $DEV_TOKEN"

# Check run receipts to see which stage is failing
curl "https://your-api.vercel.app/api/run-receipts?config_id=CONFIG_ID" \
  -H "Authorization: Bearer $DEV_TOKEN"
```

### Replay a rejection to test a fix

```bash
curl -X POST https://your-api.vercel.app/api/validate/replay/REJECTION_ID \
  -H "Authorization: Bearer $DEV_TOKEN"
```

### Reactivate after fixing

```bash
curl -X PATCH https://your-api.vercel.app/api/scrapers/CONFIG_ID/status \
  -H "Authorization: Bearer $DEV_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "status": "active" }'
```

---

## Running Tests

```bash
npm test            # Run all tests
npm run test:watch  # Watch mode
```

---

## Documentation Index

| Document | Description |
|---|---|
| [API Reference](./api-reference.md) | Complete endpoint documentation with request/response examples |
| [Data Schema](./data-schema.md) | Database tables, fields, types, constraints, and indexes |
| [Validation Rules](./validation-rules.md) | All 3 tiers of validation, configured thresholds, how to add rules |
| [ListingInput Reference](./listing-input.md) | The listing submission format with full and minimal examples |
