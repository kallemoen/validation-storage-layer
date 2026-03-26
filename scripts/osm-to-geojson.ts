/**
 * Converts OSM Overpass JSON (relations with ways and nodes) into GeoJSON.
 *
 * Usage:
 *   npx tsx scripts/osm-to-geojson.ts <input.json> <output.geojson>
 *
 * Example:
 *   npx tsx scripts/osm-to-geojson.ts scripts/data/osm_gr_admin6_full.json scripts/data/osm_gr_admin6.geojson
 */

import { readFileSync, writeFileSync } from 'fs';

interface OsmNode { type: 'node'; id: number; lat: number; lon: number }
interface OsmWay { type: 'way'; id: number; nodes: number[] }
interface OsmRelation {
  type: 'relation'; id: number;
  tags: Record<string, string>;
  members: Array<{ type: string; ref: number; role: string }>;
}
type OsmElement = OsmNode | OsmWay | OsmRelation;

const inputPath = process.argv[2];
const outputPath = process.argv[3];
if (!inputPath || !outputPath) {
  console.error('Usage: npx tsx scripts/osm-to-geojson.ts <input.json> <output.geojson>');
  process.exit(1);
}

console.log(`Reading ${inputPath}...`);
const data = JSON.parse(readFileSync(inputPath, 'utf8'));
const elements: OsmElement[] = data.elements;

// Build lookups
const nodes = new Map<number, [number, number]>(); // id → [lon, lat]
const ways = new Map<number, number[]>(); // id → [node_id, ...]
const relations: OsmRelation[] = [];

for (const el of elements) {
  if (el.type === 'node') nodes.set(el.id, [el.lon, el.lat]);
  else if (el.type === 'way') ways.set(el.id, (el as OsmWay).nodes);
  else if (el.type === 'relation') relations.push(el as OsmRelation);
}

console.log(`Nodes: ${nodes.size}, Ways: ${ways.size}, Relations: ${relations.length}`);

function wayToCoords(wayId: number): [number, number][] {
  const nodeIds = ways.get(wayId);
  if (!nodeIds) return [];
  return nodeIds
    .map(nid => nodes.get(nid))
    .filter((c): c is [number, number] => c !== undefined);
}

/**
 * Assemble ways into closed rings. Ways share endpoints and need to be
 * connected in order: way1_end === way2_start, etc.
 */
function assembleRings(wayIds: number[]): [number, number][][] {
  // Get all way coordinate arrays
  const segments = wayIds.map(id => wayToCoords(id)).filter(s => s.length > 0);
  if (segments.length === 0) return [];

  const rings: [number, number][][] = [];
  const used = new Set<number>();

  while (used.size < segments.length) {
    // Start a new ring with the first unused segment
    let startIdx = -1;
    for (let i = 0; i < segments.length; i++) {
      if (!used.has(i)) { startIdx = i; break; }
    }
    if (startIdx === -1) break;

    const ring: [number, number][] = [...segments[startIdx]];
    used.add(startIdx);

    // Keep extending the ring until it closes
    let maxIter = segments.length;
    while (maxIter-- > 0) {
      const last = ring[ring.length - 1];
      const first = ring[0];

      // Check if ring is closed (first ≈ last)
      if (ring.length > 3 && Math.abs(last[0] - first[0]) < 1e-7 && Math.abs(last[1] - first[1]) < 1e-7) {
        break;
      }

      // Find a connecting segment
      let found = false;
      for (let i = 0; i < segments.length; i++) {
        if (used.has(i)) continue;
        const seg = segments[i];
        const segFirst = seg[0];
        const segLast = seg[seg.length - 1];

        if (Math.abs(last[0] - segFirst[0]) < 1e-7 && Math.abs(last[1] - segFirst[1]) < 1e-7) {
          // Append segment (skip first point, it's the same as ring's last)
          ring.push(...seg.slice(1));
          used.add(i);
          found = true;
          break;
        } else if (Math.abs(last[0] - segLast[0]) < 1e-7 && Math.abs(last[1] - segLast[1]) < 1e-7) {
          // Append reversed segment
          ring.push(...seg.slice(0, -1).reverse());
          used.add(i);
          found = true;
          break;
        }
      }

      if (!found) break;
    }

    // Ensure ring is closed
    const f = ring[0];
    const l = ring[ring.length - 1];
    if (Math.abs(f[0] - l[0]) > 1e-7 || Math.abs(f[1] - l[1]) > 1e-7) {
      ring.push([...f]);
    }

    rings.push(ring);
  }

  return rings;
}

function relationToGeometry(rel: OsmRelation): any {
  const outerWayIds = rel.members.filter(m => m.type === 'way' && m.role === 'outer').map(m => m.ref);
  const innerWayIds = rel.members.filter(m => m.type === 'way' && m.role === 'inner').map(m => m.ref);

  // Also include members with empty role as outer (common in OSM)
  const emptyRoleWayIds = rel.members.filter(m => m.type === 'way' && m.role === '').map(m => m.ref);
  const allOuterIds = [...outerWayIds, ...emptyRoleWayIds];

  const outerRings = assembleRings(allOuterIds);
  const innerRings = assembleRings(innerWayIds);

  if (outerRings.length === 0) return null;

  if (outerRings.length === 1) {
    const coords = [outerRings[0], ...innerRings];
    return { type: 'Polygon', coordinates: coords };
  }

  // Multiple outer rings → MultiPolygon
  // Assign inner rings to the outer ring that contains them (simplified: just attach to first)
  const polygons = outerRings.map(outer => [outer]);
  for (const inner of innerRings) {
    // Simple: add to first polygon (could be smarter with point-in-polygon)
    polygons[0].push(inner);
  }
  return { type: 'MultiPolygon', coordinates: polygons };
}

// Convert relations to GeoJSON features
const features: any[] = [];
let errors = 0;

for (const rel of relations) {
  const geometry = relationToGeometry(rel);
  if (!geometry) {
    console.warn(`  Skipping relation ${rel.id} (${rel.tags?.name ?? 'unnamed'}) — could not build geometry`);
    errors++;
    continue;
  }

  features.push({
    type: 'Feature',
    properties: {
      osm_id: rel.id,
      name: rel.tags?.name ?? null,
      'name:el': rel.tags?.['name:el'] ?? null,
      'name:en': rel.tags?.['name:en'] ?? null,
      admin_level: rel.tags?.admin_level ?? null,
      ref: rel.tags?.ref ?? null,
      wikidata: rel.tags?.wikidata ?? null,
      'ISO3166-2': rel.tags?.['ISO3166-2'] ?? null,
    },
    geometry,
  });
}

const geojson = { type: 'FeatureCollection', features };

writeFileSync(outputPath, JSON.stringify(geojson), 'utf8');
console.log(`\nWritten ${features.length} features to ${outputPath}`);
if (errors > 0) console.warn(`${errors} relations could not be converted`);

// Summary
const byType = features.reduce((acc, f) => {
  acc[f.geometry.type] = (acc[f.geometry.type] || 0) + 1;
  return acc;
}, {} as Record<string, number>);
console.log('Geometry types:', byType);

// Print first 5 names
console.log('\nSample features:');
for (const f of features.slice(0, 5)) {
  const p = f.properties;
  const ringCount = f.geometry.type === 'MultiPolygon'
    ? f.geometry.coordinates.length
    : 1;
  console.log(`  ${p['name:en'] ?? p.name} | ${p['name:el'] ?? p.name} (${ringCount} polygon(s))`);
}
