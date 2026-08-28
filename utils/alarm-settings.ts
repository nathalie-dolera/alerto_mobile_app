export interface AlarmPreferenceInput {
  durationSeconds?: number | null;
}

export interface BagAlarmSettings {
  lat: number;
  lon: number;
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

export function buildBagAlarmSettings({
  lat,
  lng,
  thresholdMeters,
  durationSeconds,
}: {
  lat: number;
  lng: number;
  thresholdMeters: number;
  durationSeconds?: number | null;
}): BagAlarmSettings {
  const normalizedDuration = Number.isFinite(durationSeconds)
    ? Math.max(1, Math.round(durationSeconds as number))
    : 3;

  return {
    lat,
    lon: lng,
    wakeShakeSec: normalizedDuration,
    triggerDistanceKm: Number((thresholdMeters / 1000).toFixed(2)),
  };
}
