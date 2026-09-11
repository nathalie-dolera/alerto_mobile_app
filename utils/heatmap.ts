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
        weight: point.weight,
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
 * - Lower density: #84cc16 (Green / Lime)
 * - Moderate:      #f97316 (Orange)
 * - Higher density: #dc2626 (Red)
 */

export const riskHeatmapHaloLayerStyle: CircleLayerStyle = {
  circleColor: [
    'interpolate',
    ['linear'],
    ['coalesce', ['get', 'weight'], 1],
    1, '#84cc16',
    3, '#84cc16', // Lower density (green)
    5, '#f97316', // Moderate (orange)
    7, '#dc2626', // Higher density (red)
    10, '#dc2626',
  ],
  circleRadius: [
    'interpolate',
    ['linear'],
    ['zoom'],
    6, 16,
    10, 26,
    14, 42,
    18, 65,
  ],
  circleOpacity: 0.28,
  circleBlur: 0.85,
};

export const riskHeatmapGlowLayerStyle: CircleLayerStyle = {
  circleColor: [
    'interpolate',
    ['linear'],
    ['coalesce', ['get', 'weight'], 1],
    1, '#84cc16',
    3, '#84cc16', // Lower density (green)
    5, '#f97316', // Moderate (orange)
    7, '#dc2626', // Higher density (red)
    10, '#dc2626',
  ],
  circleRadius: [
    'interpolate',
    ['linear'],
    ['zoom'],
    6, 10,
    10, 16,
    14, 26,
    18, 40,
  ],
  circleOpacity: 0.5,
  circleBlur: 0.45,
};

export const riskHeatmapCoreLayerStyle: CircleLayerStyle = {
  circleColor: [
    'interpolate',
    ['linear'],
    ['coalesce', ['get', 'weight'], 1],
    1, '#84cc16',
    3, '#84cc16', // Lower density (green)
    5, '#f97316', // Moderate (orange)
    7, '#dc2626', // Higher density (red)
    10, '#dc2626',
  ],
  circleRadius: [
    'interpolate',
    ['linear'],
    ['zoom'],
    6, 5,
    10, 8,
    14, 13,
    18, 20,
  ],
  circleOpacity: 0.95,
  circleStrokeWidth: 2,
  circleStrokeColor: '#ffffff',
  circleStrokeOpacity: 0.9,
};
