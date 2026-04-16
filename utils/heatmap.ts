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
        weight: point.weight,
        incidentCount: point.incidentCount ?? 1,
      },
    })),
  };
}

export const riskHeatmapLayerStyle: HeatmapLayerStyle = {
  heatmapWeight: ['interpolate', ['linear'], ['get', 'weight'], 0, 0, 10, 1],
  heatmapIntensity: ['interpolate', ['linear'], ['zoom'], 7, 0.7, 12, 1.1, 16, 1.5],
  heatmapColor: [
    'interpolate',
    ['linear'],
    ['heatmap-density'],
    0,
    'rgba(34, 197, 94, 0)',
    0.2,
    'rgba(132, 204, 22, 0.45)',
    0.45,
    'rgba(250, 204, 21, 0.72)',
    0.7,
    'rgba(249, 115, 22, 0.82)',
    1,
    'rgba(220, 38, 38, 0.95)',
  ],
  heatmapRadius: ['interpolate', ['linear'], ['zoom'], 8, 14, 12, 24, 16, 42],
  heatmapOpacity: 0.82,
};