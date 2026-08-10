export const PHILIPPINES_CENTER: [number, number] = [121.774, 12.8797];

export const PHILIPPINES_BOUNDS = {
  west: 116,
  south: 4,
  east: 127,
  north: 22,
};

export const PHILIPPINES_CAMERA_BOUNDS = {
  sw: [PHILIPPINES_BOUNDS.west, PHILIPPINES_BOUNDS.south] as [number, number],
  ne: [PHILIPPINES_BOUNDS.east, PHILIPPINES_BOUNDS.north] as [number, number],
};

export function isWithinPhilippinesBounds(coords: [number, number]) {
  const [lng, lat] = coords;
  return (
    lng >= PHILIPPINES_BOUNDS.west &&
    lng <= PHILIPPINES_BOUNDS.east &&
    lat >= PHILIPPINES_BOUNDS.south &&
    lat <= PHILIPPINES_BOUNDS.north
  );
}

export function isPhilippinesSearchResult(result: any) {
  const lat = Number.parseFloat(String(result?.lat ?? result?.geometry?.coordinates?.[1] ?? ''));
  const lng = Number.parseFloat(String(result?.lon ?? result?.geometry?.coordinates?.[0] ?? ''));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }

  return isWithinPhilippinesBounds([lng, lat]);
}
