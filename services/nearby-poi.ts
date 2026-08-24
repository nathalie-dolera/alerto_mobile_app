/**
 * Nearby POI (Points of Interest) Service
 * Fetches shops, restaurants, amenities, and other registered places
 * from Overpass API (OpenStreetMap) for rendering as map pins.
 */

export interface NearbyPOI {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: 'shop' | 'food' | 'gas' | 'hotel' | 'health' | 'transport' | 'other';
  type: string; // e.g. "convenience", "restaurant", "fuel"
}

// Icon mapping for POI categories
export const POI_CATEGORY_ICONS: Record<NearbyPOI['category'], string> = {
  shop: 'store',
  food: 'food',
  gas: 'gas-station',
  hotel: 'bed',
  health: 'hospital',
  transport: 'bus',
  other: 'mappin',
};

export const POI_CATEGORY_COLORS: Record<NearbyPOI['category'], string> = {
  shop: '#e67e22',
  food: '#e74c3c',
  gas: '#2ecc71',
  hotel: '#9b59b6',
  health: '#e74c3c',
  transport: '#3498db',
  other: '#7f8c8d',
};

function categorizeAmenity(tags: Record<string, string>): { category: NearbyPOI['category']; type: string } {
  const amenity = tags.amenity || '';
  const shop = tags.shop || '';
  const tourism = tags.tourism || '';

  // Food & Dining
  if (['restaurant', 'fast_food', 'cafe', 'food_court', 'bar', 'pub', 'bakery'].includes(amenity)) {
    return { category: 'food', type: amenity };
  }
  if (shop === 'bakery' || shop === 'confectionery') {
    return { category: 'food', type: shop };
  }

  // Gas / Fuel
  if (amenity === 'fuel' || shop === 'gas') {
    return { category: 'gas', type: 'fuel' };
  }

  // Health
  if (['hospital', 'clinic', 'pharmacy', 'doctors', 'dentist'].includes(amenity)) {
    return { category: 'health', type: amenity };
  }
  if (shop === 'chemist') {
    return { category: 'health', type: 'pharmacy' };
  }

  // Hotel / Accommodation
  if (['hotel', 'motel', 'guest_house', 'hostel'].includes(tourism)) {
    return { category: 'hotel', type: tourism };
  }

  // Transport
  if (['bus_station', 'taxi', 'ferry_terminal'].includes(amenity)) {
    return { category: 'transport', type: amenity };
  }

  // Shop / Retail
  if (shop) {
    return { category: 'shop', type: shop };
  }
  if (['marketplace', 'bank', 'atm', 'money_transfer'].includes(amenity)) {
    return { category: 'shop', type: amenity };
  }

  return { category: 'other', type: amenity || tourism || 'place' };
}

/**
 * Fetch nearby POIs from Overpass API (OpenStreetMap) within a bounding box.
 * @param lat Center latitude
 * @param lng Center longitude
 * @param radiusKm Search radius in kilometers (default 1.5km)
 */
export async function fetchNearbyPOIs(lat: number, lng: number, radiusKm: number = 1.5): Promise<NearbyPOI[]> {
  // Calculate bounding box (~0.009 degrees per km at equator, good enough for PH latitude)
  const degPerKm = 0.009;
  const delta = radiusKm * degPerKm;
  const south = lat - delta;
  const north = lat + delta;
  const west = lng - delta;
  const east = lng + delta;

  // Overpass QL query for shops, amenities, restaurants, gas stations, etc.
  const query = `
[out:json][timeout:10];
(
  node["shop"](${south},${west},${north},${east});
  node["amenity"~"restaurant|fast_food|cafe|fuel|bank|atm|pharmacy|hospital|clinic|marketplace|bus_station|bar|bakery|money_transfer"](${south},${west},${north},${east});
  node["tourism"~"hotel|motel|guest_house|hostel"](${south},${west},${north},${east});
);
out body 100;
`;

  try {
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!response.ok) {
      console.warn('Overpass API error:', response.status);
      return [];
    }

    const data = await response.json();

    if (!data.elements || !Array.isArray(data.elements)) {
      return [];
    }

    const pois: NearbyPOI[] = [];
    const seen = new Set<string>();

    for (const el of data.elements) {
      if (!el.tags || !el.lat || !el.lon) continue;

      const name = el.tags.name || el.tags['name:en'] || el.tags.brand || '';
      if (!name) continue; // Skip unnamed POIs

      // Deduplicate by rounded coords
      const coordKey = `${el.lat.toFixed(4)},${el.lon.toFixed(4)}`;
      if (seen.has(coordKey)) continue;
      seen.add(coordKey);

      const { category, type } = categorizeAmenity(el.tags);

      pois.push({
        id: `osm-${el.id}`,
        name,
        lat: el.lat,
        lng: el.lon,
        category,
        type,
      });
    }

    return pois;
  } catch (error) {
    console.warn('fetchNearbyPOIs error:', error);
    return [];
  }
}
