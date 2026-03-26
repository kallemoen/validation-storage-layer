import type { AdminRegion, AdminLevelConfig } from '../../types/geography.js';
import { getRegionsForCountry, getAdminLevelConfig, getSupportedCountries } from '../../db/admin-regions.js';

export interface GeographyLookup {
  /** Whether geography data is loaded for any country */
  isInitialized(): boolean;
  /** Whether a specific country has geography data */
  hasData(countryCode: string): boolean;
  /** Max admin level for a country (e.g., 3 for PT) */
  maxLevel(countryCode: string): number;
  /** Get the label for a level (e.g., "Freguesia" for PT level 3) */
  levelLabel(countryCode: string, level: number): string | null;
  /** List of all supported country codes */
  supportedCountries(): string[];
  /** Check if a region name exists at the given level */
  regionExists(countryCode: string, level: number, name: string, parentName?: string): boolean;
  /** Find the closest matching name for suggestions */
  closestMatch(countryCode: string, level: number, name: string, parentName?: string): string | null;
  /** Get admin region by name and level */
  getRegion(countryCode: string, level: number, name: string): AdminRegion | null;
}

// Normalize a name for lookup: strip accents, lowercase
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// Simple Levenshtein distance for suggestions
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

class GeographyLookupImpl implements GeographyLookup {
  private configs: Map<string, AdminLevelConfig> = new Map();
  // Key: "CC:level:normalized_name" -> AdminRegion
  private byName: Map<string, AdminRegion> = new Map();
  // Key: "CC:level:normalized_name:parent_id" -> AdminRegion
  private byNameAndParent: Map<string, AdminRegion> = new Map();
  // Key: "CC:level" -> AdminRegion[] (for suggestions)
  private byLevel: Map<string, AdminRegion[]> = new Map();
  // id -> AdminRegion
  private byId: Map<number, AdminRegion> = new Map();

  addConfig(config: AdminLevelConfig) {
    this.configs.set(config.country_code, config);
  }

  addRegions(regions: AdminRegion[]) {
    for (const r of regions) {
      this.byId.set(r.id, r);

      const nameKey = `${r.country_code}:${r.level}:${normalize(r.name)}`;
      // If there are multiple regions with the same name at the same level (e.g., two
      // "São João" in different concelhos), the byName map will have the last one.
      // That's fine — byNameAndParent is used when parent context is available.
      this.byName.set(nameKey, r);

      // Also index by name_local (e.g., Greek script) if available
      if (r.name_local) {
        const localKey = `${r.country_code}:${r.level}:${normalize(r.name_local)}`;
        this.byName.set(localKey, r);
      }

      const parentKey = `${r.country_code}:${r.level}:${normalize(r.name)}:${r.parent_id ?? 'null'}`;
      this.byNameAndParent.set(parentKey, r);

      if (r.name_local) {
        const localParentKey = `${r.country_code}:${r.level}:${normalize(r.name_local)}:${r.parent_id ?? 'null'}`;
        this.byNameAndParent.set(localParentKey, r);
      }

      const levelKey = `${r.country_code}:${r.level}`;
      if (!this.byLevel.has(levelKey)) this.byLevel.set(levelKey, []);
      this.byLevel.get(levelKey)!.push(r);
    }
  }

  isInitialized(): boolean {
    return this.configs.size > 0;
  }

  hasData(countryCode: string): boolean {
    return this.configs.has(countryCode);
  }

  maxLevel(countryCode: string): number {
    return this.configs.get(countryCode)?.max_level ?? 0;
  }

  levelLabel(countryCode: string, level: number): string | null {
    const config = this.configs.get(countryCode);
    if (!config) return null;
    if (level === 1) return config.level_1_label;
    if (level === 2) return config.level_2_label;
    if (level === 3) return config.level_3_label;
    if (level === 4) return config.level_4_label;
    return null;
  }

  supportedCountries(): string[] {
    return Array.from(this.configs.keys()).sort();
  }

  regionExists(countryCode: string, level: number, name: string, parentName?: string): boolean {
    const normalized = normalize(name);

    if (parentName !== undefined) {
      // Look up the parent first to get its ID
      const parentNormalized = normalize(parentName);
      const parentKey = `${countryCode}:${level - 1}:${parentNormalized}`;
      const parent = this.byName.get(parentKey);
      if (parent) {
        const key = `${countryCode}:${level}:${normalized}:${parent.id}`;
        if (this.byNameAndParent.has(key)) return true;
      }
      // Even if parent not found, check without parent context as fallback
    }

    const key = `${countryCode}:${level}:${normalized}`;
    return this.byName.has(key);
  }

  closestMatch(countryCode: string, level: number, name: string, parentName?: string): string | null {
    const normalized = normalize(name);
    const levelKey = `${countryCode}:${level}`;
    let candidates = this.byLevel.get(levelKey) ?? [];

    // If parent is provided, narrow candidates to those under that parent
    if (parentName !== undefined) {
      const parentNormalized = normalize(parentName);
      const parentKey = `${countryCode}:${level - 1}:${parentNormalized}`;
      const parent = this.byName.get(parentKey);
      if (parent) {
        const filtered = candidates.filter(r => r.parent_id === parent.id);
        if (filtered.length > 0) candidates = filtered;
      }
    }

    let bestDist = Infinity;
    let bestName: string | null = null;

    for (const r of candidates) {
      const dist = levenshtein(normalized, normalize(r.name));
      if (dist < bestDist) {
        bestDist = dist;
        bestName = r.name;
      }
      // Also check name_local for non-Latin script matching
      if (r.name_local) {
        const localDist = levenshtein(normalized, normalize(r.name_local));
        if (localDist < bestDist) {
          bestDist = localDist;
          bestName = r.name_local;
        }
      }
    }

    // Only suggest if the distance is reasonable (< 50% of the input length)
    if (bestName && bestDist <= Math.ceil(normalized.length * 0.5)) {
      return bestName;
    }
    return null;
  }

  getRegion(countryCode: string, level: number, name: string): AdminRegion | null {
    const key = `${countryCode}:${level}:${normalize(name)}`;
    return this.byName.get(key) ?? null;
  }
}

// Module-level cache
let cachedLookup: GeographyLookupImpl | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function loadGeographyLookup(): Promise<GeographyLookup> {
  const now = Date.now();
  if (cachedLookup && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedLookup;
  }

  const lookup = new GeographyLookupImpl();

  // Load all supported country configs
  const configs = await getSupportedCountries();
  for (const config of configs) {
    lookup.addConfig(config);
    const regions = await getRegionsForCountry(config.country_code);
    lookup.addRegions(regions);
  }

  cachedLookup = lookup;
  cacheTimestamp = now;
  return lookup;
}

// For testing: create a lookup from provided data
export function createGeographyLookup(
  configs: AdminLevelConfig[],
  regions: AdminRegion[],
): GeographyLookup {
  const lookup = new GeographyLookupImpl();
  for (const config of configs) lookup.addConfig(config);
  lookup.addRegions(regions);
  return lookup;
}
