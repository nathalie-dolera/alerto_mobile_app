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

  // Allow up to 2500 points so all nationwide TomTom traffic and hazard points are shown
  const cappedPoints = validPoints.slice(0, 2500);

  return {
    type: 'FeatureCollection' as const,
    features: cappedPoints.map((point) => {
      const rawWeight = Number(point.weight) || 1;
      const weight = rawWeight >= 3 ? 3 : rawWeight === 2 ? 2 : 1;

      return {
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [point.lng, point.lat] as [number, number],
        },
        properties: {
          id: point.id,
          weight,
          incidentCount: point.incidentCount ?? 1,
        },
      };
    }),
  };
}

/**
 * Circle layer style for risk visualization.
 * Uses a clear, visible color ramp based on weight:
 *   1 (green – low) → 2 (amber/orange – moderate) → 3 (red – severe)
 *
 * Sized and weighted for clear visibility across zoom levels without GPU lag.
 */
export const riskCircleLayerStyle: CircleLayerStyle = {
  // Clear color by weight: Green (low) → Amber (moderate) → Red (severe)
  circleColor: [
    'interpolate',
    ['linear'],
    ['get', 'weight'],
    1, '#22c55e',  // green – low risk / light traffic
    2, '#f59e0b',  // amber/orange – moderate risk
    3, '#ef4444',  // red – severe / high risk / accident
  ],
  // Radius: visible at overview zoom but compact at street level
  // Kept small enough that individual points don't blob together when zoomed in
  circleRadius: [
    'interpolate',
    ['linear'],
    ['zoom'],
    5,  5,
    8,  8,
    11, 11,
    14, 14,
    17, 18,
  ],
  // Clear visibility: 0.55 allows seeing streets underneath while being vividly colored
  circleOpacity: 0.55,
  // Gentle blur: 0.35 creates a soft heat halo without making circles disappear
  circleBlur: 0.35,
  // Soft outer border for clean definition
  circleStrokeColor: [
    'interpolate',
    ['linear'],
    ['get', 'weight'],
    1, '#16a34a',
    2, '#d97706',
    3, '#b91c1c',
  ],
  circleStrokeWidth: 1,
  circleStrokeOpacity: 0.35,
  circlePitchAlignment: 'map',
};

// Keep backward-compatible export name
export const riskHeatmapLayerStyle = riskCircleLayerStyle;
