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
    10, 1
  ],
  heatmapIntensity: [
    'interpolate',
    ['linear'],
    ['zoom'],
    0, 1,
    9, 3
  ],
  heatmapColor: [
    'interpolate',
    ['linear'],
    ['heatmap-density'],
    0, 'rgba(132, 204, 22, 0)', // Transparent
    0.2, '#84cc16', // Green
    0.6, '#f97316', // Orange
    1, '#dc2626'    // Red
  ],
  heatmapRadius: [
    'interpolate',
    ['linear'],
    ['zoom'],
    6, 10,
    10, 20,
    14, 40,
    18, 80
  ],
  heatmapOpacity: 0.8,
};
