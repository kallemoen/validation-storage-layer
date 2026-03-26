# Claude Code Instructions

## Project Overview

Validation & Storage Layer for a real estate scraper system. Vercel serverless API + Supabase (PostGIS). Listings go through a 3-tier validation pipeline before storage.

## Always Do These When Making Changes

### Update Documentation

When you modify API behavior, input/output schemas, validation rules, or endpoints:
- Update `docs/api-reference.md` with any endpoint or response format changes
- Update `docs/listing-input.md` if the listing input schema changes
- Update `docs/validation-rules.md` if validation rules are added, removed, or modified
- Update `docs/quickstart.md` if the developer workflow changes

### Update Notices

When you make a **breaking or behavioral change** to the API (e.g., fields removed, new required fields, changed validation, new enrichment behavior):
- Add a notice in `src/lib/notices.ts` with a clear message explaining what changed and what developers should do
- Set the expiry date to ~2 weeks from the change date
- Remove expired notices when you see them

Notices appear in every API response so scraper developers are informed immediately.

## Key Architecture

- **API endpoints:** `api/` directory (Vercel serverless functions)
- **Validation:** `src/validation/` — 3-tier pipeline (schema → semantic → quality)
- **Enrichment:** `src/enrichment/` — location enrichment via PostGIS + Mapbox
- **DB layer:** `src/db/` — Supabase client wrappers
- **Types:** `src/types/` — Zod schemas and TypeScript interfaces
- **Response helpers:** `src/lib/response.ts` — `success()` and `error()` wrappers
- **Notices:** `src/lib/notices.ts` — time-boxed API change notifications
- **Migrations:** `supabase/migrations/` — sequential SQL migrations

## Testing

```bash
npm test        # Run all tests (vitest)
npx tsc --noEmit  # Type check
```

## Deployment

- Supabase project: `edknotcorruqjysartka`
- Push migrations: `npx supabase db push`
- Deploy: `npx vercel deploy --prod`
