import { RiskHeatmapPoint } from '@/services/hazards';
import { HeatmapLayerStyle } from '@maplibre/maplibre-react-native';

export function createRiskHeatmapShape(points: RiskHeatmapPoint[]) {
  const validPoints = (points || []).filter(
    (point) =>
      point &&
      typeof point.lng === 'number' &&
      typeof point.lat === 'number' &&
      !isNaN(point.lng) &&
      !isNaN(point.lat)
  );

  return {
    type: 'FeatureCollection' as const,
    features: validPoints.map((point) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [point.lng, point.lat] as [number, number],
      },
      properties: {
        id: point.id,
        weight: Number(point.weight) || 1,
        incidentCount: point.incidentCount ?? 1,
      },
    })),
  };
}

/**
 * Continuous Native Heatmap
 * 
 * - heatmapWeight: How much a single point contributes to the heatmap (uses the 'weight' property).
 * - heatmapColor: Color ramp based on density.
 * - heatmapRadius: Smoothly blends points together.
 */
export const riskHeatmapLayerStyle: HeatmapLayerStyle = {
  heatmapWeight: [
    'interpolate',
    ['linear'],
    ['get', 'weight'],
    0, 0.2,
    2, 0.45,
    5, 0.7,
    8, 0.9,
    10, 1.0
  ],
  heatmapIntensity: [
    'interpolate',
    ['linear'],
    ['zoom'],
    0, 0.5,
    10, 0.8,
    14, 1.1,
    16, 1.4,
    18, 1.8
  ],
  heatmapColor: [
    'interpolate',
    ['linear'],
    ['heatmap-density'],
    0, 'rgba(0, 0, 0, 0)',
    0.12, 'rgba(132, 204, 22, 0.35)', // Faint green halo
    0.25, '#84cc16',                  // Green (Low risk / low density)
    0.50, '#eab308',                  // Yellow (Moderate risk)
    0.72, '#f97316',                  // Orange (High risk)
    0.88, '#ef4444',                  // Red (Very high risk)
    1.0, '#991b1b'                    // Deep Red (Severe risk)
  ],
  heatmapRadius: [
    'interpolate',
    ['linear'],
    ['zoom'],
    6, 10,
    10, 20,
    13, 32,
    16, 46,
    18, 60,
    20, 75
  ],
  heatmapOpacity: 0.85,
};

