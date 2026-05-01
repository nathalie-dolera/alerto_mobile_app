import type { LocationGeocodedAddress } from 'expo-location';

export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3; 
  const toRadians = (deg: number) => deg * (Math.PI / 180);
  const φ1 = toRadians(lat1);
  const φ2 = toRadians(lat2);
  const Δφ = toRadians(lat2 - lat1);
  const Δλ = toRadians(lon2 - lon1);

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; 
};

function normalizePart(value?: string | null) {
  return value?.trim() || '';
}

function dedupeParts(parts: string[]) {
  return parts.filter((part, index) => (
    parts.findIndex(candidate => candidate.toLowerCase() === part.toLowerCase()) === index
  ));
}

function joinLocationParts(parts: Array<string | null | undefined>, limit = 2) {
  const normalized = dedupeParts(
    parts
      .map(normalizePart)
      .filter(Boolean)
  );

  return normalized.length > 0 ? normalized.slice(0, limit).join(', ') : null;
}

export function formatCoordinateFallbackLabel(lat: number, lng: number) {
  return `Pinned location (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
}

export function formatSearchResultLabel(displayName?: string | null, fallback?: string | null) {
  const segments = displayName
    ?.split(',')
    .map(segment => segment.trim())
    .filter(Boolean);

  return joinLocationParts(segments ?? [], 2) || normalizePart(fallback) || null;
}

export function getLabelFromReverseGeocodeResult(data: any) {
  const address = data?.address ?? {};

  return (
    joinLocationParts([
      address.amenity,
      address.shop,
      address.tourism,
      address.building,
      address.house_number && address.road ? `${address.house_number} ${address.road}` : undefined,
      address.road,
      address.neighbourhood,
      address.suburb,
      address.city,
      address.town,
      address.village,
      address.municipality,
      address.state,
    ], 2) ||
    formatSearchResultLabel(data?.display_name)
  );
}

export function getLabelFromPlacemark(placemark?: LocationGeocodedAddress | null) {
  if (!placemark) {
    return null;
  }

  return joinLocationParts([
    placemark.name,
    placemark.street,
    placemark.district,
    placemark.city,
    placemark.subregion,
    placemark.region,
  ], 2);
}
