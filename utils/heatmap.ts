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
    ['get', 'weight'],
    0, 0.1,
    5, 0.6,
    10, 1.0,
  ],
  heatmapIntensity: [
    'interpolate',
    ['linear'],
    ['zoom'],
    4, 0.6,
    9, 1.0,
    14, 1.5,
    18, 2.0,
  ],
  heatmapColor: [
    'interpolate',
    ['linear'],
    ['heatmap-density'],
    0, 'rgba(34, 197, 94, 0)',
    0.15, 'rgba(132, 204, 22, 0.55)',
    0.4, 'rgba(250, 204, 21, 0.78)',
    0.65, 'rgba(249, 115, 22, 0.88)',
    1.0, 'rgba(220, 38, 38, 0.95)',
  ],
  heatmapRadius: [
    'interpolate',
    ['linear'],
    ['zoom'],
    4, 12,
    8, 22,
    12, 38,
    16, 60,
    20, 90,
  ],
  heatmapOpacity: 0.88,
};

export const riskHeatmapHaloLayerStyle: CircleLayerStyle = {
  circleColor: [
    'interpolate',
    ['linear'],
    ['get', 'weight'],
    1, '#84cc16',
    3, '#facc15',
    5, '#f97316',
    7, '#dc2626',
  ],
  circleRadius: [
    'interpolate',
    ['linear'],
    ['zoom'],
    6, 12,
    12, 28,
    16, 45,
  ],
  circleOpacity: 0.22,
  circleBlur: 0.9,
};

export const riskHeatmapGlowLayerStyle: CircleLayerStyle = {
  circleColor: [
    'interpolate',
    ['linear'],
    ['get', 'weight'],
    1, '#84cc16',
    3, '#facc15',
    5, '#f97316',
    7, '#dc2626',
  ],
  circleRadius: [
    'interpolate',
    ['linear'],
    ['zoom'],
    6, 8,
    12, 18,
    16, 30,
  ],
  circleOpacity: 0.35,
  circleBlur: 0.6,
};

export const riskHeatmapCoreLayerStyle: CircleLayerStyle = {
  circleColor: [
    'interpolate',
    ['linear'],
    ['get', 'weight'],
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
    12, 8,
    16, 14,
  ],
  circleOpacity: 0.85,
  circleBlur: 0.15,
  circleStrokeWidth: 1.5,
  circleStrokeColor: '#ffffff',
  circleStrokeOpacity: 0.6,
};
