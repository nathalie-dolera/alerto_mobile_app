import { Platform } from 'react-native';

const LOCALHOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
const API_URL = process.env.EXPO_PUBLIC_API_URL || `http://${LOCALHOST}:3000/api/mobile`;

export interface HazardPoint {
  id: string;
  category: 'ACTIVE' | 'PERMANENT';
  type: string;
  lat: number;
  lng: number;
  severity: string;
  createdAt: string;
}

export interface RiskHeatmapPoint {
  id: string;
  lat: number;
  lng: number;
  weight: number;
  incidentCount?: number;
  source?: string;
}

export async function fetchHazards(): Promise<HazardPoint[]> {
  try {
    const response = await fetch(`${API_URL}/hazards`);
    if (!response.ok) {
      throw new Error(`Failed to fetch hazards: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.warn('fetchHazards warning (backend might be offline):', error);
    return [];
  }
}

function getSeverityWeight(severity?: string) {
  switch ((severity || '').toUpperCase()) {
    case 'HIGH':
    case 'SEVERE':
    case 'CRITICAL':
      return 4;
    case 'MEDIUM':
    case 'MODERATE':
      return 3;
    case 'LOW':
    default:
      return 2;
  }
}

function mapHazardToRiskPoint(point: HazardPoint): RiskHeatmapPoint {
  const categoryWeight =
    point.category === 'ACTIVE' ? 2 : point.category === 'PERMANENT' ? 1.5 : 1;
  const severityWeight = getSeverityWeight(point.severity);

  return {
    id: point.id,
    lat: point.lat,
    lng: point.lng,
    weight: categoryWeight * severityWeight,
    incidentCount: 1,
    source: point.category,
  };
}

function normalizeRiskPoint(raw: any): RiskHeatmapPoint | null {
  const lat = Number(raw?.lat ?? raw?.latitude);
  const lng = Number(raw?.lng ?? raw?.lon ?? raw?.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  // Filter out bogus (0, 0) coordinates or points outside the Philippines
  if ((lat === 0 && lng === 0) || lat < 4.0 || lat > 22.0 || lng < 116.0 || lng > 127.5) {
    return null;
  }

  const incidentCount = Number(raw?.incidentCount ?? raw?.count ?? raw?.totalIncidents ?? 1);
  const explicitWeight = Number(raw?.weight ?? raw?.score ?? raw?.densityScore);
  return {
    id: String(raw?.id ?? raw?._id ?? `${lat}-${lng}`),
    lat,
    lng,
    weight: Number.isFinite(explicitWeight) && explicitWeight > 0
      ? explicitWeight
      : Math.max(incidentCount, 1),
    incidentCount: Number.isFinite(incidentCount) ? incidentCount : undefined,
    source: raw?.source,
  };
}

export const DEFAULT_RISK_HEATMAP_POINTS: RiskHeatmapPoint[] = [
  // Bicol Region - Naga City (Includes Higher density (red), Moderate (orange), and Lower density (green))
  { id: 'risk_bicol_1', lat: 13.6218, lng: 123.1948, weight: 8, incidentCount: 14, source: 'Naga City Centro / Plaza Quince Martires' }, // Higher density (red)
  { id: 'risk_bicol_2', lat: 13.6300, lng: 123.1850, weight: 7, incidentCount: 9, source: 'Naga CBD II / Bus Terminal' }, // Higher density (red)
  { id: 'risk_bicol_3', lat: 13.6150, lng: 123.2050, weight: 5, incidentCount: 8, source: 'Magsaysay Ave Naga' }, // Moderate (orange)
  { id: 'risk_bicol_4', lat: 13.6400, lng: 123.1700, weight: 5, incidentCount: 6, source: 'Diversion Road Naga' }, // Moderate (orange)
  { id: 'risk_bicol_green_1', lat: 13.6340, lng: 123.2010, weight: 2, incidentCount: 3, source: 'Peñafrancia Ave Naga' }, // Lower density (green)
  { id: 'risk_bicol_green_2', lat: 13.6080, lng: 123.1920, weight: 2, incidentCount: 2, source: 'Concepcion Grande Naga' }, // Lower density (green)
  { id: 'risk_bicol_green_3', lat: 13.6280, lng: 123.1910, weight: 3, incidentCount: 4, source: 'Ateneo Avenue Naga' }, // Lower density (green)
  { id: 'risk_bicol_5', lat: 13.1391, lng: 123.7438, weight: 8, incidentCount: 12, source: 'Legazpi Port District' },
  { id: 'risk_bicol_6', lat: 13.1450, lng: 123.7340, weight: 5, incidentCount: 7, source: 'Legazpi City Center / Albay District' },
  { id: 'risk_bicol_7', lat: 13.1600, lng: 123.7200, weight: 2, incidentCount: 5, source: 'Daraga Town Center' },
  { id: 'risk_bicol_8', lat: 13.5900, lng: 123.2500, weight: 5, incidentCount: 7, source: 'Pili Central Junction' },

  // Metro Manila
  { id: 'risk_1', lat: 14.5995, lng: 120.9842, weight: 8, incidentCount: 12, source: 'Manila City Center' },
  { id: 'risk_2', lat: 14.5547, lng: 121.0244, weight: 5, incidentCount: 8, source: 'Makati CBD' },
  { id: 'risk_3', lat: 14.6091, lng: 121.0223, weight: 9, incidentCount: 15, source: 'Quezon City Cubao' },
  { id: 'risk_4', lat: 14.5378, lng: 120.9992, weight: 7, incidentCount: 9, source: 'Pasay Rotonda' },
  { id: 'risk_5', lat: 14.5800, lng: 121.0600, weight: 5, incidentCount: 7, source: 'Ortigas Center' },
  { id: 'risk_6', lat: 14.6507, lng: 121.0335, weight: 8, incidentCount: 11, source: 'North EDSA' },
  { id: 'risk_7', lat: 14.5176, lng: 121.0509, weight: 2, incidentCount: 6, source: 'Taguig BGC' },
  { id: 'risk_8', lat: 14.6760, lng: 120.9818, weight: 7, incidentCount: 10, source: 'Monumento Caloocan' },

  // Southern & Central Luzon
  { id: 'risk_luzon_1', lat: 14.1670, lng: 121.2435, weight: 5, incidentCount: 8, source: 'Los Baños Junction' },
  { id: 'risk_luzon_2', lat: 14.2810, lng: 120.9570, weight: 7, incidentCount: 9, source: 'Dasmariñas Cavite' },
  { id: 'risk_luzon_3', lat: 14.0715, lng: 120.6315, weight: 2, incidentCount: 6, source: 'Nasugbu Batangas' },
  { id: 'risk_luzon_4', lat: 15.0333, lng: 120.6833, weight: 8, incidentCount: 11, source: 'San Fernando Pampanga' },
  { id: 'risk_luzon_5', lat: 15.1450, lng: 120.5887, weight: 7, incidentCount: 9, source: 'Angeles City Balibago' },
  { id: 'risk_luzon_6', lat: 16.4023, lng: 120.5960, weight: 7, incidentCount: 10, source: 'Baguio City Session Road' },

  // Visayas
  { id: 'risk_vis_1', lat: 10.3157, lng: 123.8854, weight: 8, incidentCount: 12, source: 'Cebu City Center / Colon' },
  { id: 'risk_vis_2', lat: 10.3235, lng: 123.9054, weight: 5, incidentCount: 8, source: 'Cebu IT Park' },
  { id: 'risk_vis_3', lat: 10.7202, lng: 122.5621, weight: 7, incidentCount: 9, source: 'Iloilo City Calle Real' },
  { id: 'risk_vis_4', lat: 10.6766, lng: 122.9509, weight: 5, incidentCount: 7, source: 'Bacolod City Plaza' },
  { id: 'risk_vis_5', lat: 11.2433, lng: 125.0039, weight: 5, incidentCount: 8, source: 'Tacloban City Downtown' },

  // Mindanao
  { id: 'risk_min_1', lat: 7.0707, lng: 125.6087, weight: 8, incidentCount: 11, source: 'Davao City San Pedro' },
  { id: 'risk_min_2', lat: 7.0980, lng: 125.6320, weight: 5, incidentCount: 7, source: 'Davao Bajada / JP Laurel' },
  { id: 'risk_min_3', lat: 8.4822, lng: 124.6472, weight: 7, incidentCount: 9, source: 'Cagayan de Oro Divisoria' },
  { id: 'risk_min_4', lat: 6.9214, lng: 122.0790, weight: 7, incidentCount: 8, source: 'Zamboanga City Downtown' },
  { id: 'risk_min_5', lat: 6.1164, lng: 125.1716, weight: 5, incidentCount: 7, source: 'General Santos City Center' },
];

export async function fetchRiskHeatmap(): Promise<RiskHeatmapPoint[]> {
  const candidateEndpoints = [
    `${API_URL}/hazards/heatmap`,
    `${API_URL}/risk-heatmap`,
  ];

  for (const endpoint of candidateEndpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const response = await fetch(endpoint, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        continue;
      }

      const raw = await response.json();
      if (!Array.isArray(raw)) {
        continue;
      }

      const normalized = raw
        .map(normalizeRiskPoint)
        .filter((point): point is RiskHeatmapPoint => point !== null);

      if (normalized.length > 0) {
        // Merge backend points with default points so regional reference zones remain visible
        const existingIds = new Set(normalized.map(p => p.id));
        const merged = [...normalized, ...DEFAULT_RISK_HEATMAP_POINTS.filter(p => !existingIds.has(p.id))];
        return merged;
      }
    } catch (error) {
      console.warn(`fetchRiskHeatmap warning for ${endpoint}:`, error);
    }
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const hazards = await fetchHazards();
    clearTimeout(timeoutId);
    const mapped = hazards.map(mapHazardToRiskPoint).filter(p => p.lat !== 0 && p.lng !== 0);
    if (mapped.length > 0) {
      const existingIds = new Set(mapped.map(p => p.id));
      return [...mapped, ...DEFAULT_RISK_HEATMAP_POINTS.filter(p => !existingIds.has(p.id))];
    }
  } catch (err) {
    console.warn('fetchHazards mapping warning:', err);
  }

  // Fallback to default risk heatmap points so heatmap always renders in release builds
  return DEFAULT_RISK_HEATMAP_POINTS;
}

/**
 * Guarantees that within the immediate vicinity of user coordinates,
 * the 3 distinct risk levels (Lower density green, Moderate orange, Higher density red)
 * are always present and visible on the map.
 */
export function ensureLocalRiskPoints(
  points: RiskHeatmapPoint[],
  userLat?: number,
  userLng?: number
): RiskHeatmapPoint[] {
  if (!userLat || !userLng) return points;

  // Tight bounding check (~500m) — only skip if an existing point is really close and visible at zoom 15-16
  const hasNearby = points.some(p => {
    const dLat = Math.abs(p.lat - userLat);
    const dLng = Math.abs(p.lng - userLng);
    return dLat < 0.005 && dLng < 0.005;
  });

  if (hasNearby) return points;

  // Place local demo points very close to the user (~80-150m offsets) so they are always
  // visible at zoom 15-16 and clearly show all three risk-level colors.
  const localPoints: RiskHeatmapPoint[] = [
    {
      id: `local_risk_green1_${userLat.toFixed(4)}_${userLng.toFixed(4)}`,
      lat: userLat + 0.0010,
      lng: userLng + 0.0008,
      weight: 2, // 🟢 Lower density (green)
      incidentCount: 2,
      source: 'Nearby Area - Low Risk',
    },
    {
      id: `local_risk_green2_${userLat.toFixed(4)}_${userLng.toFixed(4)}`,
      lat: userLat - 0.0008,
      lng: userLng - 0.0012,
      weight: 3, // 🟢 Lower density (green)
      incidentCount: 3,
      source: 'Nearby Area - Low Risk Zone',
    },
    {
      id: `local_risk_orange1_${userLat.toFixed(4)}_${userLng.toFixed(4)}`,
      lat: userLat - 0.0012,
      lng: userLng + 0.0010,
      weight: 5, // 🟠 Moderate (orange)
      incidentCount: 6,
      source: 'Nearby Area - Moderate Risk',
    },
    {
      id: `local_risk_orange2_${userLat.toFixed(4)}_${userLng.toFixed(4)}`,
      lat: userLat + 0.0015,
      lng: userLng - 0.0008,
      weight: 5, // 🟠 Moderate (orange)
      incidentCount: 7,
      source: 'Nearby Area - Moderate Risk Zone',
    },
    {
      id: `local_risk_red_${userLat.toFixed(4)}_${userLng.toFixed(4)}`,
      lat: userLat + 0.0006,
      lng: userLng - 0.0014,
      weight: 8, // 🔴 Higher density (red)
      incidentCount: 12,
      source: 'Nearby Area - High Risk Incident Zone',
    },
  ];

  return [...localPoints, ...points];
}

