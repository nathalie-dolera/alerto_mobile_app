import { RiskHeatmapPoint } from '@/services/hazards';
import { CircleLayerStyle } from '@maplibre/maplibre-react-native';

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
 * Multi-layer glowing circle heatmap:
 * 1. riskHeatmapHalo: Wide soft glowing outer aura
 * 2. riskHeatmapGlow: Intense medium-radius glow
 * 3. riskHeatmapCore: Sharp solid colored core with white stroke
 *
 * Exact color palette matching legend:
 * - Lower density (weight < 4):  #84cc16 (Green / Lime)
 * - Moderate (weight 4 - 6):     #f97316 (Orange)
 * - Higher density (weight >= 7): #dc2626 (Red)
 */

export const riskHeatmapHaloLayerStyle: CircleLayerStyle = {
  circleColor: [
    'step',
    ['to-number', ['get', 'weight'], 1],
    '#84cc16', // default / weight < 4: Lower density (green)
    4,
    '#f97316', // weight >= 4: Moderate (orange)
    7,
    '#dc2626', // weight >= 7: Higher density (red)
  ],
  circleRadius: [
    'interpolate',
    ['linear'],
    ['zoom'],
    6, 24,
    10, 36,
    14, 58,
    18, 85,
  ],
  circleOpacity: 0.45,
  circleBlur: 0.7,
};

export const riskHeatmapGlowLayerStyle: CircleLayerStyle = {
  circleColor: [
    'step',
    ['to-number', ['get', 'weight'], 1],
    '#84cc16',
    4,
    '#f97316',
    7,
    '#dc2626',
  ],
  circleRadius: [
    'interpolate',
    ['linear'],
    ['zoom'],
    6, 16,
    10, 24,
    14, 36,
    18, 52,
  ],
  circleOpacity: 0.65,
  circleBlur: 0.3,
};

export const riskHeatmapCoreLayerStyle: CircleLayerStyle = {
  circleColor: [
    'step',
    ['to-number', ['get', 'weight'], 1],
    '#84cc16',
    4,
    '#f97316',
    7,
    '#dc2626',
  ],
  circleRadius: [
    'interpolate',
    ['linear'],
    ['zoom'],
    6, 7,
    10, 11,
    14, 16,
    18, 24,
  ],
  circleOpacity: 0.95,
  circleStrokeWidth: 2.5,
  circleStrokeColor: '#ffffff',
  circleStrokeOpacity: 0.95,
};
