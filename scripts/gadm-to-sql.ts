/**
 * Converts GADM + OSM GeoJSON data into a SQL migration for seeding admin_regions.
 *
 * For Greece, uses:
 *   - GADM level 2 (Regions) → our admin level 1
 *   - OSM admin level 6 (Regional Units) → our admin level 2
 *   - GADM level 3 (Municipalities) → our admin level 3
 *
 * Parent linkage uses ST_Contains spatial queries in the migration SQL itself,
 * so it works even when mixing data sources.
 *
 * Usage:
 *   npx tsx scripts/gadm-to-sql.ts GR
 *
 * Outputs: supabase/migrations/00016_seed_gr_regions.sql
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = join(__dirname, 'data');
const COORD_PRECISION = 5;
const SIMPLIFY_EPSILON = 0.001;

// ---- Country configuration ----

interface LevelSource {
  ourLevel: number;
  source: 'gadm' | 'osm';
  /** GADM level number (for source: 'gadm') */
  gadmLevel?: number;
  /** GeoJSON filename (for source: 'osm') */
  osmFile?: string;
  /** Property name for English name */
  nameField: string;
  /** Property name for local-script name */
  nameLocalField: string;
  /** Property name for external ID */
  idField: string;
  /** Optional: strip these prefixes from English names */
  stripEnPrefix?: string[];
  /** Optional: strip these prefixes from local names */
  stripLocalPrefix?: string[];
}

interface CountryConfig {
  iso3: string;
  labels: [string, string | null, string | null, string | null];
  maxLevel: number;
  migrationNum: string;
  levels: LevelSource[];
}

const CONFIGS: Record<string, CountryConfig> = {
  GR: {
    iso3: 'GRC',
    labels: ['Region', 'Regional Unit', 'Municipality', null],
    maxLevel: 3,
    migrationNum: '00016',
    levels: [
      {
        ourLevel: 1,
        source: 'gadm',
        gadmLevel: 2,
        nameField: 'NAME_2',
        nameLocalField: 'NL_NAME_2',
        idField: 'GID_2',
      },
      {
        ourLevel: 2,
        source: 'osm',
        osmFile: 'osm_gr_admin6.geojson',
        nameField: 'name:en',
        nameLocalField: 'name:el',
        idField: 'osm_id',
        stripEnPrefix: ['Regional Unit of ', ' Regional Unit'],
        stripLocalPrefix: ['Περιφερειακή Ενότητα '],
      },
      {
        ourLevel: 3,
        source: 'gadm',
        gadmLevel: 3,
        nameField: 'NAME_3',
        nameLocalField: 'NL_NAME_3',
        idField: 'GID_3',
      },
    ],
  },
};

// ---- Utilities ----

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function escapeSQL(s: string): string {
  return s.replace(/'/g, "''");
}

/** Fix GADM's space-stripped names: "NorthAegean" → "North Aegean" */
function fixGadmName(name: string): string {
  let fixed = name.replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2');
  fixed = fixed.replace(/(\p{Ll})(and|και)(\s)/gu, '$1 $2$3');
  fixed = fixed.replace(/(\p{Ll})(and|και)$/gu, '$1 $2');
  return fixed.trim();
}

/** Strip known prefixes/suffixes from OSM names */
function cleanOsmName(name: string, strips: string[]): string {
  let cleaned = name;
  for (const s of strips) {
    if (s.startsWith(' ')) {
      // Suffix
      if (cleaned.endsWith(s.trim())) {
        cleaned = cleaned.slice(0, -s.trim().length).trim();
      }
    } else {
      // Prefix
      if (cleaned.startsWith(s)) {
        cleaned = cleaned.slice(s.length).trim();
      }
    }
  }
  return cleaned;
}

function readGeoJSON(filename: string) {
  const path = join(DATA_DIR, filename);
  if (!existsSync(path)) {
    throw new Error(`File not found: ${path}`);
  }
  let raw = readFileSync(path, 'utf8');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
  return JSON.parse(raw);
}

// ---- Douglas-Peucker simplification ----

function perpDist(p: number[], a: number[], b: number[]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const mag2 = dx * dx + dy * dy;
  if (mag2 === 0) return Math.sqrt((p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2);
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / mag2;
  return Math.sqrt((p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2);
}

function douglasPeucker(pts: number[][], eps: number): number[][] {
  if (pts.length <= 2) return pts;
  let maxD = 0, maxI = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], pts[0], pts[pts.length - 1]);
    if (d > maxD) { maxD = d; maxI = i; }
  }
  if (maxD > eps) {
    const l = douglasPeucker(pts.slice(0, maxI + 1), eps);
    const r = douglasPeucker(pts.slice(maxI), eps);
    return l.slice(0, -1).concat(r);
  }
  return [pts[0], pts[pts.length - 1]];
}

function simplifyRing(ring: number[][]): number[][] {
  const s = douglasPeucker(ring, SIMPLIFY_EPSILON);
  if (s.length < 4) {
    if (ring.length >= 4) return [ring[0], ring[Math.floor(ring.length / 3)], ring[Math.floor(2 * ring.length / 3)], ring[0]];
    return ring;
  }
  return s;
}

function simplifyGeometry(geometry: any): any {
  if (geometry.type === 'Polygon') {
    return { type: 'Polygon', coordinates: geometry.coordinates.map(simplifyRing) };
  } else if (geometry.type === 'MultiPolygon') {
    return {
      type: 'MultiPolygon',
      coordinates: geometry.coordinates.map((poly: number[][][]) => poly.map(simplifyRing)),
    };
  }
  return geometry;
}

function roundCoords(coords: any): any {
  if (typeof coords[0] === 'number') {
    const factor = 10 ** COORD_PRECISION;
    return [
      Math.round(coords[0] * factor) / factor,
      Math.round(coords[1] * factor) / factor,
    ];
  }
  return coords.map(roundCoords);
}

function processGeometry(geometry: any): { geojson: string; centroid: [number, number] } {
  const rounded = { type: geometry.type, coordinates: roundCoords(geometry.coordinates) };
  const simplified = simplifyGeometry(rounded);

  let sumLng = 0, sumLat = 0, count = 0;
  function walk(c: any) {
    if (typeof c[0] === 'number') { sumLng += c[0]; sumLat += c[1]; count++; }
    else { for (const x of c) walk(x); }
  }
  walk(simplified.coordinates);
  const centroid: [number, number] = count > 0
    ? [Math.round(sumLng / count * 100000) / 100000, Math.round(sumLat / count * 100000) / 100000]
    : [0, 0];

  return { geojson: JSON.stringify(simplified), centroid };
}

// ---- Main ----

const countryCode = process.argv[2]?.toUpperCase();
if (!countryCode) {
  console.error('Usage: npx tsx scripts/gadm-to-sql.ts <country_code>');
  process.exit(1);
}

const config = CONFIGS[countryCode];
if (!config) {
  console.error(`No config for ${countryCode}. Add it to CONFIGS.`);
  process.exit(1);
}

const OUTPUT = join(__dirname, '..', 'supabase', 'migrations', `${config.migrationNum}_seed_${countryCode.toLowerCase()}_regions.sql`);

console.log(`Processing ${countryCode} (${config.iso3}) — ${config.maxLevel} levels`);

const lines: string[] = [];
lines.push('-- Auto-generated from GADM + OSM GeoJSON data');
lines.push('-- Sources: https://gadm.org, https://www.openstreetmap.org');
lines.push('-- Generated by scripts/gadm-to-sql.ts');
lines.push('');
lines.push('BEGIN;');
lines.push('');

// Admin level config
lines.push(`-- Admin level config for ${countryCode}`);
lines.push(
  `INSERT INTO admin_level_config (country_code, level_1_label, level_2_label, level_3_label, level_4_label, max_level) VALUES (` +
  `'${countryCode}', ` +
  `'${escapeSQL(config.labels[0])}', ` +
  `${config.labels[1] ? `'${escapeSQL(config.labels[1])}'` : 'NULL'}, ` +
  `${config.labels[2] ? `'${escapeSQL(config.labels[2])}'` : 'NULL'}, ` +
  `${config.labels[3] ? `'${escapeSQL(config.labels[3])}'` : 'NULL'}, ` +
  `${config.maxLevel});`
);
lines.push('');

// Process each level
for (const level of config.levels) {
  let features: any[];
  let sourceLabel: string;

  if (level.source === 'gadm') {
    const filename = `gadm41_${config.iso3}_${level.gadmLevel}.json`;
    console.log(`Reading ${filename} (GADM level ${level.gadmLevel} → our level ${level.ourLevel})...`);
    const geojson = readGeoJSON(filename);
    features = geojson.features;
    sourceLabel = `GADM level ${level.gadmLevel}`;
  } else {
    console.log(`Reading ${level.osmFile} (OSM → our level ${level.ourLevel})...`);
    const geojson = readGeoJSON(level.osmFile!);
    features = geojson.features;
    sourceLabel = 'OSM';
  }

  console.log(`  ${features.length} features from ${sourceLabel}`);
  const label = config.labels[level.ourLevel - 1] ?? `Level ${level.ourLevel}`;
  lines.push(`-- Level ${level.ourLevel}: ${label} (${features.length}) [from ${sourceLabel}]`);

  for (let i = 0; i < features.length; i++) {
    const props = features[i].properties;

    // Extract and clean name
    let name = props[level.nameField] ?? '';
    let nameLocal = props[level.nameLocalField] ?? null;

    if (level.source === 'gadm') {
      name = fixGadmName(name);
      if (nameLocal) nameLocal = fixGadmName(nameLocal);
    }

    if (level.stripEnPrefix) {
      name = cleanOsmName(name, level.stripEnPrefix);
    }
    if (level.stripLocalPrefix && nameLocal) {
      nameLocal = cleanOsmName(nameLocal, level.stripLocalPrefix);
    }

    const nameAscii = stripAccents(name);
    const externalId = String(props[level.idField] ?? '');

    // Parent reference via spatial lookup (ST_Contains with nearest-neighbor fallback for islands)
    let parentSQL = 'NULL';
    if (level.ourLevel > 1) {
      parentSQL =
        `(SELECT id FROM admin_regions WHERE country_code = '${countryCode}' AND level = ${level.ourLevel - 1} ` +
        `AND boundary IS NOT NULL ` +
        `ORDER BY ST_Distance(boundary::geography, ST_SetSRID(ST_Point(%CENTROID_LNG%, %CENTROID_LAT%), 4326)::geography) LIMIT 1)`;
    }

    const { geojson: geoStr, centroid } = processGeometry(features[i].geometry);

    // Replace centroid placeholders in parent SQL
    parentSQL = parentSQL.replace('%CENTROID_LNG%', String(centroid[0])).replace('%CENTROID_LAT%', String(centroid[1]));

    const nameLocalSQL = nameLocal ? `'${escapeSQL(nameLocal)}'` : 'NULL';

    lines.push(
      `INSERT INTO admin_regions (country_code, level, name, name_ascii, name_local, parent_id, boundary, centroid, external_id) VALUES (` +
      `'${countryCode}', ${level.ourLevel}, '${escapeSQL(name)}', '${escapeSQL(nameAscii)}', ${nameLocalSQL}, ${parentSQL}, ` +
      `ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON('${escapeSQL(geoStr)}'), 4326)), ` +
      `ST_SetSRID(ST_Point(${centroid[0]}, ${centroid[1]}), 4326), ` +
      `'${escapeSQL(externalId)}');`
    );

    if ((i + 1) % 100 === 0) console.log(`  Processed ${i + 1}/${features.length}...`);
  }
  lines.push('');
}

lines.push('COMMIT;');

const sql = lines.join('\n');
writeFileSync(OUTPUT, sql, 'utf8');
console.log(`\nWritten to ${OUTPUT}`);
console.log(`Total lines: ${lines.length}`);
console.log(`File size: ${(Buffer.byteLength(sql) / 1024 / 1024).toFixed(1)} MB`);

// Print sample names
console.log('\nSample names per level:');
for (const level of config.levels) {
  let features: any[];
  if (level.source === 'gadm') {
    features = readGeoJSON(`gadm41_${config.iso3}_${level.gadmLevel}.json`).features;
  } else {
    features = readGeoJSON(level.osmFile!).features;
  }
  const label = config.labels[level.ourLevel - 1];
  console.log(`  Level ${level.ourLevel} (${label}):`);
  for (const f of features.slice(0, 3)) {
    let name = f.properties[level.nameField] ?? '';
    let nameLocal = f.properties[level.nameLocalField] ?? '';
    if (level.source === 'gadm') { name = fixGadmName(name); nameLocal = fixGadmName(nameLocal); }
    if (level.stripEnPrefix) name = cleanOsmName(name, level.stripEnPrefix);
    if (level.stripLocalPrefix) nameLocal = cleanOsmName(nameLocal, level.stripLocalPrefix);
    console.log(`    "${name}" | "${nameLocal}"`);
  }
}
