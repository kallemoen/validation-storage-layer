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
    id: 'scraper-health-tracking',
    message:
      'The batch endpoint now tracks scraper health based on validation outcomes. Scrapers with acceptance rate below 70% are marked "degraded", below 30% "broken". Scrapers that don\'t check in for 24 hours are auto-marked "broken". Auto-recovery occurs when a healthy batch (>= 70% acceptance) is submitted. Query the scraper registry for acceptance_rate and top_rejection_rule fields.',
    expires: '2026-04-09',
  },
  {
    id: 'title-required',
    message:
      'The "title" field is now required. Listings submitted without a non-empty title (string, max 500 chars) will be rejected at Tier 1 validation. Update your scraper to extract and include the listing title.',
    expires: '2026-04-10',
  },
];

export function getActiveNotices(): string[] {
  const now = new Date().toISOString().slice(0, 10);
  return ALL_NOTICES
    .filter((n) => n.expires >= now)
    .map((n) => n.message);
}
