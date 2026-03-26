# Claude Code Instructions

## Project Overview

Validation & Storage Layer for a real estate scraper system. Vercel serverless API + Supabase (PostGIS). Listings go through a 3-tier validation pipeline before storage.

## Feature Development Workflow

Every new feature **must start with the `/plan` skill** to create a structured implementation plan before any code is written. The plan must include these as explicit tasks:

1. **New feature branch** — Create a `feature/<name>` branch off `main`. Keep work isolated until ready to merge via PR.
2. **Update notices** — If the feature changes API behavior (new fields, removed fields, changed validation, new enrichment), add a notice in `src/lib/notices.ts` so scraper developers see the change immediately in their API responses.
3. **Update docs** — Update the relevant docs (`docs/api-reference.md`, `docs/listing-input.md`, `docs/validation-rules.md`, `docs/quickstart.md`) so developers using the API always have accurate documentation.

This ensures we always think before we build, and make it easy for others to use our code and API.

---

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
