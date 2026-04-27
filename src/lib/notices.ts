/**
 * API notices system.
 *
 * Active notices are included in every API response under the `notices` field.
 * Use this to communicate breaking changes, deprecations, or migration guidance
 * to scraper developers. Each notice has an expiry date after which it stops appearing.
 *
 * When making API changes, always add a notice here so developers see it
 * immediately in their scraper output.
 */

export interface Notice {
  id: string;
  message: string;
  expires: string; // ISO date string (YYYY-MM-DD)
}

const ALL_NOTICES: Notice[] = [
  {
    id: 'display-coords-removed',
    message:
      'display_latitude and display_longitude are now server-computed. Remove these fields from your payload — any values you send will be ignored.',
    expires: '2026-04-08',
  },
  {
    id: 'ocean-coordinates',
    message:
      'Listings with coordinates that don\'t fall on land (no admin region found within 10km) are now rejected during enrichment. Verify your latitude/longitude values point to a real location.',
    expires: '2026-04-08',
  },
  {
    id: 'location-mode-exclusive',
    message:
      'Location modes are now mutually exclusive. Coordinate mode (granularity "coordinates"/"address"): send only lat/lng, system backfills admin levels. Admin level mode (granularity "admin_level_*"): send only admin_level_* fields, system generates display coordinates. Sending both will be rejected.',
    expires: '2026-04-08',
  },
  {
    id: 'greece-supported',
    message:
      'Greece (GR) is now supported. Listings can be submitted with country_code "GR" — admin levels are validated against official administrative boundaries (Region → Regional Unit → Municipality). Both Latin transliterations and Greek script names are accepted.',
    expires: '2026-04-09',
  },
  {
    id: 'pipeline-health-tracking',
    message:
      'Scraper health tracking now uses 6 failure checks across the full pipeline (discovery, extraction, validation, staleness). The /run endpoint now evaluates discovery and pipeline health. The batch endpoint evaluates validation health. Registration requires "expected_discovery_count" and "run_interval_hours" fields. Degraded scrapers auto-recover on a clean run; broken scrapers require manual reset. See docs/validation-rules.md for the full failure mode reference.',
    expires: '2026-04-13',
  },
  {
    id: 'features-field',
    message:
      'New optional field "features" (string array) is now available. Include listing feature tags (e.g. ["garage", "pool", "elevator"]) for richer data. A Tier 3 warning will appear if features are not provided.',
    expires: '2026-04-14',
  },
  {
    id: 'title-nonempty',
    message:
      'The "title" field is now trimmed before validation, and titles that are empty or whitespace-only are rejected at Tier 1. A matching DB CHECK constraint blocks the same case at the storage layer. Ensure your scraper sends a real, non-empty title.',
    expires: '2026-05-11',
  },
  {
    id: 'scraper-config-update',
    message:
      'New endpoint: PATCH /api/scrapers/{id}/config allows updating scraper configuration fields (agency_name, country_code, area_key, listing_type, config, expected_discovery_count, run_interval_hours) after registration. All fields are optional — send only what you want to change.',
    expires: '2026-04-18',
  },
  {
    id: 'search-endpoints',
    message:
      'Search endpoints (admin and reader roles): POST /api/search/execute accepts {"sql": "SELECT ..."} for read-only SQL queries against the database (5s timeout, 500-row limit). GET /api/search/schema returns table/column metadata. See docs/search-guide.md for full reference.',
    expires: '2026-04-19',
  },
  {
    id: 'reader-role',
    message:
      'New "reader" role provides read-only access to all GET endpoints and search endpoints. Use this role for AI agents and external consumers that only need to query data. Search endpoints no longer require admin role.',
    expires: '2026-04-19',
  },
  {
    id: 'auto-expire-dead-listings',
    message:
      'Listings whose source_url returns HTTP 404 or 410 are now automatically marked as listing_status="expired" by a daily Supabase cron. Other failures (5xx, timeouts, 403/429) are ignored to avoid false positives. A new last_url_check_at timestamp records when each URL was last polled. Re-submit the listing to revive it if it comes back online.',
    expires: '2026-05-11',
  },
];

export function getActiveNotices(): string[] {
  const now = new Date().toISOString().slice(0, 10);
  return ALL_NOTICES
    .filter((n) => n.expires >= now)
    .map((n) => n.message);
}
