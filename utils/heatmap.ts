// utils/heatmap.ts – lightweight circle-based risk visualization
// Replaces the GPU-heavy HeatmapLayer with a simple CircleLayer
// to avoid constant re-rendering ("beating") and crashes on Android.

import { CircleLayerStyle } from '@maplibre/maplibre-react-native';
import { RiskHeatmapPoint } from '@/services/hazards';

/**
 * Generate a GeoJSON FeatureCollection for risk heatmap points.
 * Weight is capped at 3 to keep visual distribution even.
 */
export function createRiskHeatmapShape(points: RiskHeatmapPoint[]) {
  const validPoints = (points || []).filter(
    (point) =>
      point &&
      typeof point.lng === 'number' &&
      typeof point.lat === 'number' &&
      Number.isFinite(point.lng) &&
      Number.isFinite(point.lat)
  );

  // Limit number of points to 300 to prevent OOM on Android
  const cappedPoints = validPoints.slice(0, 300);

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
        weight: Math.min(Number(point.weight) || 1, 3),
        incidentCount: point.incidentCount ?? 1,
      },
    })),
  };
}

/**
 * Circle layer style for risk visualization.
 * Uses a simple color ramp based on weight:
 *   green (low) → yellow (moderate) → orange (high) → red (severe)
 *
 * This is far lighter than HeatmapLayer and won't cause GPU pressure
 * or the "beating/loading" effect on Android devices.
 */
export const riskCircleLayerStyle: CircleLayerStyle = {
  // Color by weight: green → yellow → orange → red
  circleColor: [
    'interpolate',
    ['linear'],
    ['get', 'weight'],
    0,   '#84cc16',  // green – low risk
    1,   '#eab308',  // yellow – moderate risk
    2,   '#f97316',  // orange – high risk
    3,   '#ef4444',  // red – severe risk
  ],
  // Radius scales gently with zoom for good visibility at all levels
  circleRadius: [
    'interpolate',
    ['linear'],
    ['zoom'],
    6,  3,
    10, 6,
    13, 10,
    16, 16,
    18, 20,
  ],
  // Soft transparency so circles don't feel too heavy or harsh
  circleOpacity: 0.28,
  // High blur gives a smooth, gentle ambient "glow" like a soft heatmap
  circleBlur: 0.9,
  circleStrokeWidth: 0,
};

// Keep backward-compatible export name
export const riskHeatmapLayerStyle = riskCircleLayerStyle;
