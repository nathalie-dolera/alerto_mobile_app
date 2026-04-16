const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

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
    console.error('fetchHazards error:', error);
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

export async function fetchRiskHeatmap(): Promise<RiskHeatmapPoint[]> {
  const candidateEndpoints = [
    `${API_URL}/hazards/heatmap`,
    `${API_URL}/risk-heatmap`,
  ];

  for (const endpoint of candidateEndpoints) {
    try {
      const response = await fetch(endpoint);
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
        return normalized;
      }
    } catch (error) {
      console.error(`fetchRiskHeatmap error for ${endpoint}:`, error);
    }
  }

  const hazards = await fetchHazards();
  return hazards.map(mapHazardToRiskPoint);
}
