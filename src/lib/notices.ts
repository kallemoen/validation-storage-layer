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
    id: 'location-mode-exclusive',
    message:
      'Location modes are now mutually exclusive. Coordinate mode (granularity "coordinates"/"address"): send only lat/lng, system backfills admin levels. Admin level mode (granularity "admin_level_*"): send only admin_level_* fields, system generates display coordinates. Sending both will be rejected.',
    expires: '2026-04-08',
  },
];

export function getActiveNotices(): string[] {
  const now = new Date().toISOString().slice(0, 10);
  return ALL_NOTICES
    .filter((n) => n.expires >= now)
    .map((n) => n.message);
}
