export interface AlarmPreferenceInput {
  intensity?: string | null;
  durationSeconds?: number | null;
}

export interface WearableAlarmSettings {
  lat: number;
  lon: number;
  sleeperType: number;
  wakeShakeSec: number;
  triggerDistanceKm: number;
}

export function parseDistanceToMeters(distance?: string | null) {
  const match = (distance || '').trim().toLowerCase().match(/^([0-9.]+)\s*(km|m)$/);

  if (!match) {
    return null;
  }

  const value = Number(match[1]);

  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  return match[2] === 'km' ? value * 1000 : value;
}

export function mapIntensityToSleeperType(intensity?: string | null) {
  switch ((intensity || '').toLowerCase()) {
    case 'medium':
      return 2;
    case 'hard':
      return 3;
    case 'light':
    default:
      return 1;
  }
}

export function buildWearableAlarmSettings({
  lat,
  lng,
  thresholdMeters,
  intensity,
  durationSeconds,
}: {
  lat: number;
  lng: number;
  thresholdMeters: number;
  intensity?: string | null;
  durationSeconds?: number | null;
}): WearableAlarmSettings {
  const normalizedDuration = Number.isFinite(durationSeconds)
    ? Math.max(1, Math.round(durationSeconds as number))
    : 3;

  return {
    lat,
    lon: lng,
    sleeperType: mapIntensityToSleeperType(intensity),
    wakeShakeSec: normalizedDuration,
    triggerDistanceKm: Math.round((thresholdMeters / 1000) * 100) / 100,
  };
}
