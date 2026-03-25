export interface GeocodingResult {
  latitude: number;
  longitude: number;
  admin_level_1?: string;
  admin_level_2?: string;
  admin_level_3?: string;
  admin_level_4?: string;
  postal_code?: string;
  address?: string;
}

export interface GeocodingProvider {
  reverseGeocode(lat: number, lng: number): Promise<GeocodingResult | null>;
  forwardGeocode(address: string, countryCode: string): Promise<GeocodingResult | null>;
}

/**
 * Mapbox Geocoding API implementation.
 * Docs: https://docs.mapbox.com/api/search/geocoding/
 */
export class MapboxGeocodingProvider implements GeocodingProvider {
  private readonly accessToken: string;
  private readonly baseUrl = 'https://api.mapbox.com/search/geocode/v6';

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  async reverseGeocode(lat: number, lng: number): Promise<GeocodingResult | null> {
    const url = `${this.baseUrl}/reverse?longitude=${lng}&latitude=${lat}&access_token=${this.accessToken}`;

    try {
      const response = await fetch(url);
      if (!response.ok) return null;

      const data = await response.json() as MapboxResponse;
      if (!data.features?.length) return null;

      return this.parseFeatures(data.features, lat, lng);
    } catch {
      console.error('Mapbox reverse geocoding failed');
      return null;
    }
  }

  async forwardGeocode(address: string, countryCode: string): Promise<GeocodingResult | null> {
    const params = new URLSearchParams({
      q: address,
      country: countryCode.toLowerCase(),
      access_token: this.accessToken,
      limit: '1',
    });
    const url = `${this.baseUrl}/forward?${params}`;

    try {
      const response = await fetch(url);
      if (!response.ok) return null;

      const data = await response.json() as MapboxResponse;
      if (!data.features?.length) return null;

      const feature = data.features[0];
      const coords = feature.geometry?.coordinates;
      if (!coords) return null;

      return this.parseFeatures(data.features, coords[1], coords[0]);
    } catch {
      console.error('Mapbox forward geocoding failed');
      return null;
    }
  }

  private parseFeatures(features: MapboxFeature[], lat: number, lng: number): GeocodingResult {
    const result: GeocodingResult = { latitude: lat, longitude: lng };

    for (const feature of features) {
      const type = feature.properties?.feature_type;
      const name = feature.properties?.name;
      if (!type || !name) continue;

      switch (type) {
        case 'region':
          result.admin_level_1 = name;
          break;
        case 'district':
          result.admin_level_2 = name;
          break;
        case 'place':
          result.admin_level_3 = name;
          break;
        case 'locality':
        case 'neighborhood':
          result.admin_level_4 = name;
          break;
        case 'postcode':
          result.postal_code = name;
          break;
        case 'address':
          result.address = feature.properties?.full_address ?? name;
          break;
      }
    }

    return result;
  }
}

interface MapboxResponse {
  features?: MapboxFeature[];
}

interface MapboxFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    feature_type?: string;
    name?: string;
    full_address?: string;
  };
}

// Singleton provider
let provider: GeocodingProvider | null = null;

export function getGeocodingProvider(): GeocodingProvider | null {
  if (provider) return provider;

  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) {
    console.warn('MAPBOX_ACCESS_TOKEN not set, geocoding disabled');
    return null;
  }

  provider = new MapboxGeocodingProvider(token);
  return provider;
}
