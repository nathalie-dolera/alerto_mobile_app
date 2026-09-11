import { RiskHeatmapPoint } from '@/services/hazards';
import { CircleLayerStyle, HeatmapLayerStyle } from '@maplibre/maplibre-react-native';

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

export const riskHeatmapLayerStyle: HeatmapLayerStyle = {
  heatmapWeight: [
    'interpolate',
    ['linear'],
    ['coalesce', ['get', 'weight'], 1],
    0, 0,
    10, 1,
  ],
  heatmapIntensity: [
    'interpolate',
    ['linear'],
    ['zoom'],
    4, 0.5,
    9, 1.0,
    14, 1.5,
    18, 2.0,
  ],
  heatmapColor: [
    'interpolate',
    ['linear'],
    ['heatmap-density'],
    0, 'rgba(34, 197, 94, 0)',
    0.2, 'rgba(132, 204, 22, 0.55)',
    0.45, 'rgba(250, 204, 21, 0.75)',
    0.7, 'rgba(249, 115, 22, 0.85)',
    1.0, 'rgba(220, 38, 38, 0.95)',
  ],
  heatmapRadius: [
    'interpolate',
    ['linear'],
    ['zoom'],
    4, 14,
    8, 24,
    12, 40,
    16, 65,
    20, 95,
  ],
  heatmapOpacity: 0.85,
};

export const riskHeatmapCoreLayerStyle: CircleLayerStyle = {
  circleColor: [
    'interpolate',
    ['linear'],
    ['coalesce', ['get', 'weight'], 1],
    1, '#84cc16',
    3, '#facc15',
    5, '#f97316',
    7, '#dc2626',
  ],
  circleRadius: [
    'interpolate',
    ['linear'],
    ['zoom'],
    6, 3,
    12, 6,
    16, 12,
  ],
  circleOpacity: 0.8,
  circleBlur: 0.2,
};

export const riskHeatmapHaloLayerStyle: CircleLayerStyle = {
  circleColor: [
    'interpolate',
    ['linear'],
    ['coalesce', ['get', 'weight'], 1],
    1, '#84cc16',
    3, '#facc15',
    5, '#f97316',
    7, '#dc2626',
  ],
  circleRadius: [
    'interpolate',
    ['linear'],
    ['zoom'],
    6, 6,
    12, 14,
    16, 24,
  ],
  circleOpacity: 0.2,
  circleBlur: 0.8,
};

export const riskHeatmapGlowLayerStyle: CircleLayerStyle = {
  circleColor: [
    'interpolate',
    ['linear'],
    ['coalesce', ['get', 'weight'], 1],
    1, '#84cc16',
    3, '#facc15',
    5, '#f97316',
    7, '#dc2626',
  ],
  circleRadius: [
    'interpolate',
    ['linear'],
    ['zoom'],
    6, 4,
    12, 10,
    16, 18,
  ],
  circleOpacity: 0.3,
  circleBlur: 0.5,
};

