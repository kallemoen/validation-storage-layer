/**
 * Converts CAOP GeoJSON files (EPSG:3763) into a SQL migration for seeding admin_regions.
 *
 * Usage:
 *   npx tsx scripts/caop-to-sql.ts
 *
 * Reads from scripts/data/Continente{Distritos,Concelhos,Freguesias}.geojson
 * Outputs to supabase/migrations/00012_seed_portugal_regions.sql
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import proj4 from 'proj4';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = join(__dirname, 'data');
const OUTPUT = join(__dirname, '..', 'supabase', 'migrations', '00012_seed_portugal_regions.sql');

// EPSG:3763 (PT-TM06/ETRS89) definition
proj4.defs('EPSG:3763', '+proj=tmerc +lat_0=39.6682583333333 +lon_0=-8.13310833333333 +k=1 +x_0=0 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');

// Coordinate precision for WGS84 output: 5 decimal places ≈ ~1m
const COORD_PRECISION = 5;

// Douglas-Peucker simplification epsilon in degrees
// 0.001 ≈ ~100m at Portugal's latitude
const SIMPLIFY_EPSILON = 0.001;

function readGeoJSON(filename: string) {
  let raw = readFileSync(join(DATA_DIR, filename), 'utf8');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
  return JSON.parse(raw);
}

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function titleCase(s: string): string {
  const small = new Set(['de', 'da', 'do', 'dos', 'das', 'e', 'a', 'o', 'as', 'os']);
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((word, i) => {
      if (i > 0 && small.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

function escapeSQL(s: string): string {
  return s.replace(/'/g, "''");
}

// ---- Coordinate transformation ----

function toWGS84(coord: [number, number]): [number, number] {
  const [lng, lat] = proj4('EPSG:3763', 'EPSG:4326', coord);
  return [
    Math.round(lng * (10 ** COORD_PRECISION)) / (10 ** COORD_PRECISION),
    Math.round(lat * (10 ** COORD_PRECISION)) / (10 ** COORD_PRECISION),
  ];
}

function transformCoords(coords: any): any {
  if (typeof coords[0] === 'number') {
    return toWGS84(coords as [number, number]);
  }
  return coords.map(transformCoords);
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
  // Valid polygon ring needs >= 4 points (3 unique + closing)
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
      coordinates: geometry.coordinates.map((poly: number[][][]) =>
        poly.map(simplifyRing)
      ),
    };
  }
  return geometry;
}

// ---- SQL generation ----

function processGeometry(geometry: any): { geojson: string; centroid: [number, number] } {
  // 1. Transform to WGS84
  const wgs84 = { type: geometry.type, coordinates: transformCoords(geometry.coordinates) };
  // 2. Simplify
  const simplified = simplifyGeometry(wgs84);
  // 3. Compute centroid from simplified geometry
  let sumLng = 0, sumLat = 0, count = 0;
  function walk(c: any) {
    if (typeof c[0] === 'number') { sumLng += c[0]; sumLat += c[1]; count++; }
    else { for (const x of c) walk(x); }
  }
  walk(simplified.coordinates);
  const centroidCoord: [number, number] = count > 0
    ? [Math.round(sumLng / count * 100000) / 100000, Math.round(sumLat / count * 100000) / 100000]
    : [0, 0];

  return { geojson: JSON.stringify(simplified), centroid: centroidCoord };
}

// ---- Main ----

console.log('Reading GeoJSON files...');
const distritos = readGeoJSON('ContinenteDistritos.geojson');
const concelhos = readGeoJSON('ContinenteConcelhos.geojson');
const freguesias = readGeoJSON('ContinenteFreguesias.geojson');

console.log(`Distritos: ${distritos.features.length}`);
console.log(`Concelhos: ${concelhos.features.length}`);
console.log(`Freguesias: ${freguesias.features.length}`);

const lines: string[] = [];
lines.push('-- Auto-generated from CAOP GeoJSON data (EPSG:3763 → EPSG:4326)');
lines.push('-- Source: https://github.com/nmota/caop_GeoJSON');
lines.push('-- Generated by scripts/caop-to-sql.ts');
lines.push('');
lines.push('BEGIN;');
lines.push('');

// Level 1: Distritos
lines.push('-- Level 1: Distritos (18)');
const distritoNames = new Map<string, string>();

for (const feature of distritos.features) {
  const props = feature.properties;
  const code = props.DI;
  const name = titleCase(props.Distrito);
  const nameAscii = stripAccents(name);
  distritoNames.set(code, name);

  const { geojson, centroid } = processGeometry(feature.geometry);
  lines.push(
    `INSERT INTO admin_regions (country_code, level, name, name_ascii, parent_id, boundary, centroid, external_id) VALUES (` +
    `'PT', 1, '${escapeSQL(name)}', '${escapeSQL(nameAscii)}', NULL, ` +
    `ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON('${escapeSQL(geojson)}'), 4326)), ` +
    `ST_SetSRID(ST_Point(${centroid[0]}, ${centroid[1]}), 4326), ` +
    `'${escapeSQL(code)}');`
  );
}
lines.push('');

// Level 2: Concelhos
lines.push(`-- Level 2: Concelhos (${concelhos.features.length})`);
const concelhoNames = new Map<string, string>();

for (const feature of concelhos.features) {
  const props = feature.properties;
  const code = props.DICO;
  const distritoCode = code.substring(0, 2);
  const name = titleCase(props.Concelho);
  const nameAscii = stripAccents(name);
  concelhoNames.set(code, name);

  if (!distritoNames.has(distritoCode)) {
    console.warn(`Warning: Concelho ${name} references unknown distrito code ${distritoCode}`);
    continue;
  }

  const { geojson, centroid } = processGeometry(feature.geometry);
  lines.push(
    `INSERT INTO admin_regions (country_code, level, name, name_ascii, parent_id, boundary, centroid, external_id) VALUES (` +
    `'PT', 2, '${escapeSQL(name)}', '${escapeSQL(nameAscii)}', ` +
    `(SELECT id FROM admin_regions WHERE country_code = 'PT' AND level = 1 AND external_id = '${escapeSQL(distritoCode)}'), ` +
    `ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON('${escapeSQL(geojson)}'), 4326)), ` +
    `ST_SetSRID(ST_Point(${centroid[0]}, ${centroid[1]}), 4326), ` +
    `'${escapeSQL(code)}');`
  );
}
lines.push('');

// Level 3: Freguesias
lines.push(`-- Level 3: Freguesias (${freguesias.features.length})`);

for (let i = 0; i < freguesias.features.length; i++) {
  const feature = freguesias.features[i];
  const props = feature.properties;
  const dicofre = props.Dicofre;
  const concelhoCode = dicofre.substring(0, 4);
  const name = props.Freguesia;
  const nameAscii = stripAccents(name);

  const { geojson, centroid } = processGeometry(feature.geometry);
  lines.push(
    `INSERT INTO admin_regions (country_code, level, name, name_ascii, parent_id, boundary, centroid, external_id) VALUES (` +
    `'PT', 3, '${escapeSQL(name)}', '${escapeSQL(nameAscii)}', ` +
    `(SELECT id FROM admin_regions WHERE country_code = 'PT' AND level = 2 AND external_id = '${escapeSQL(concelhoCode)}'), ` +
    `ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON('${escapeSQL(geojson)}'), 4326)), ` +
    `ST_SetSRID(ST_Point(${centroid[0]}, ${centroid[1]}), 4326), ` +
    `'${escapeSQL(dicofre)}');`
  );

  if ((i + 1) % 500 === 0) console.log(`  Processed ${i + 1}/${freguesias.features.length} freguesias...`);
}
lines.push('');
lines.push('COMMIT;');

const sql = lines.join('\n');
writeFileSync(OUTPUT, sql, 'utf8');
console.log(`\nWritten to ${OUTPUT}`);
console.log(`Total lines: ${lines.length}`);
console.log(`File size: ${(Buffer.byteLength(sql) / 1024 / 1024).toFixed(1)} MB`);
