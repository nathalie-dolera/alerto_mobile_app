import { RiskHeatmapPoint } from '@/services/hazards';
import { HeatmapLayerStyle } from '@maplibre/maplibre-react-native';

export function createRiskHeatmapShape(points: RiskHeatmapPoint[]) {
  return {
    type: 'FeatureCollection' as const,
    features: points.map((point) => ({
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
    0, 0,
    2, 0.25,
    5, 0.55,
    8, 0.85,
    10, 1.0
  ],
  heatmapIntensity: [
    'interpolate',
    ['linear'],
    ['zoom'],
    0, 0.5,
    10, 0.8,
    15, 1.0,
    18, 1.2
  ],
  heatmapColor: [
    'interpolate',
    ['linear'],
    ['heatmap-density'],
    0, 'rgba(0, 0, 0, 0)',
    0.15, 'rgba(132, 204, 22, 0.4)', // Faint green
    0.30, '#84cc16',                  // Green (Low risk / low density)
    0.60, '#f97316',                  // Orange (Moderate risk)
    0.85, '#dc2626',                  // Red (High risk)
    1.0, '#991b1b'                   // Deep Red (Severe risk)
  ],
  heatmapRadius: [
    'interpolate',
    ['linear'],
    ['zoom'],
    6, 8,
    10, 16,
    14, 26,
    17, 36,
    20, 50
  ],
  heatmapOpacity: 0.75,
};
