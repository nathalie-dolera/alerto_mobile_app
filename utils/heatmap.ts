// utils/heatmap.ts – clean implementation

import { HeatmapLayerStyle } from '@maplibre/maplibre-react-native';
import { RiskHeatmapPoint } from '@/services/hazards';
/**
 * Generate a GeoJSON FeatureCollection for risk heatmap points.
 * Weight is capped at 3 to avoid a single dominant hotspot.
 */
export function createRiskHeatmapShape(points: RiskHeatmapPoint[]) {
  const validPoints = (points || []).filter(
    (point) =>
      point &&
      typeof point.lng === 'number' &&
      typeof point.lat === 'number' &&
      !isNaN(point.lng) &&
      !isNaN(point.lat)
  );

  // Limit number of points to 500 to prevent OOM on Android
  const cappedPoints = validPoints.slice(0, 500);

  return {
    type: 'FeatureCollection' as const,
    features: cappedPoints.map((point) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [point.lng, point.lat] as [number, number],
      },
      properties: {
        id: point.id,
        // cap weight to 3 to keep heatmap distribution even
        weight: Math.min(Number(point.weight) || 1, 3),
        incidentCount: point.incidentCount ?? 1,
      },
    })),
  };
}

/**
 * Heatmap layer style configuration.
 * - weight ramp matches the capped weight range (0‑3)
 * - radius tuned for better point separation and Android memory usage
 */
export const riskHeatmapLayerStyle: HeatmapLayerStyle = {
  heatmapWeight: [
    'interpolate',
    ['linear'],
    ['get', 'weight'],
    0, 0.2,
    1, 0.35,
    2, 0.55,
    3, 0.85,
  ],
  heatmapIntensity: [
    'interpolate',
    ['linear'],
    ['zoom'],
    0, 0.5,
    10, 0.8,
    14, 1.1,
    16, 1.4,
    18, 1.8,
  ],
  heatmapColor: [
    'interpolate',
    ['linear'],
    ['heatmap-density'],
    0, 'rgba(0, 0, 0, 0)',
    0.12, 'rgba(132, 204, 22, 0.35)', // faint green halo
    0.25, '#84cc16', // green – low risk
    0.5, '#eab308', // yellow – moderate risk
    0.72, '#f97316', // orange – high risk
    0.88, '#ef4444', // red – very high risk
    1.0, '#991b1b', // deep red – severe risk
  ],
  // radius tuned for Android performance and clearer visual separation
  heatmapRadius: [
    'interpolate',
    ['linear'],
    ['zoom'],
    6, 8,
    10, 14,
    13, 22,
    16, 32,
    18, 45,
    20, 30,
  ],
  heatmapOpacity: 0.85,
};


