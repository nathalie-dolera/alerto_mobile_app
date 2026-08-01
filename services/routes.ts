import { Platform } from 'react-native';

const LOCALHOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
const API_URL = process.env.EXPO_PUBLIC_API_URL || `http://${LOCALHOST}:3000/api/mobile`;

export interface RoutePoint {
  lat: number;
  lng: number;
}

export interface TrafficSegment {
  id: string;
  points: RoutePoint[];
  delaySeconds: number;
  lengthMeters: number;
  severity: 'low' | 'moderate' | 'heavy';
}

export interface RoutePlan {
  points: RoutePoint[];
  distanceMeters: number;
  travelTimeSeconds: number;
  trafficDelaySeconds: number;
  trafficLengthMeters: number;
  trafficSegments: TrafficSegment[];
  isFallback?: boolean;
}

function toRadians(degrees: number) {
  return degrees * Math.PI / 180;
}

function calculateDistanceMeters(fromLat: number, fromLng: number, toLat: number, toLng: number) {
  const earthRadiusMeters = 6371000;
  const dLat = toRadians(toLat - fromLat);
  const dLng = toRadians(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
}

function buildFallbackRoutePlan(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): RoutePlan {
  const distanceMeters = calculateDistanceMeters(fromLat, fromLng, toLat, toLng);

  return {
    points: [
      { lat: fromLat, lng: fromLng },
      { lat: toLat, lng: toLng },
    ],
    distanceMeters,
    travelTimeSeconds: Math.max(60, Math.round(distanceMeters / 8.33)),
    trafficDelaySeconds: 0,
    trafficLengthMeters: 0,
    trafficSegments: [],
    isFallback: true,
  };
}

async function fetchOsrmRoutePlan(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): Promise<RoutePlan | null> {
  const coordinates = `${fromLng},${fromLat};${toLng},${toLat}`;
  const params = new URLSearchParams({
    overview: 'full',
    geometries: 'geojson',
    alternatives: 'false',
    steps: 'false',
  });

  const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch OSRM route plan: ${response.status}`);
  }

  const data = await response.json();
  const route = data?.routes?.[0];
  const coordinatesList = route?.geometry?.coordinates;

  if (!Array.isArray(coordinatesList) || coordinatesList.length < 2) {
    return null;
  }

  return {
    points: coordinatesList.map(([lng, lat]: [number, number]) => ({ lat, lng })),
    distanceMeters: Number(route.distance) || calculateDistanceMeters(fromLat, fromLng, toLat, toLng),
    travelTimeSeconds: Math.max(60, Math.round(Number(route.duration) || 60)),
    trafficDelaySeconds: 0,
    trafficLengthMeters: 0,
    trafficSegments: [],
  };
}

export async function fetchRoutePlan(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): Promise<RoutePlan | null> {
  try {
    const params = new URLSearchParams({
      fromLat: String(fromLat),
      fromLng: String(fromLng),
      toLat: String(toLat),
      toLng: String(toLng),
    });

    const response = await fetch(`${API_URL}/routes?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch route plan: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.warn(`fetchRoutePlan warning (from ${fromLat},${fromLng} to ${toLat},${toLng}), trying OSRM route:`, error);
    try {
      const osrmRoute = await fetchOsrmRoutePlan(fromLat, fromLng, toLat, toLng);

      if (osrmRoute) {
        return osrmRoute;
      }
    } catch (osrmError) {
      console.warn(`fetchRoutePlan OSRM warning (from ${fromLat},${fromLng} to ${toLat},${toLng}), using fallback route:`, osrmError);
    }

    return buildFallbackRoutePlan(fromLat, fromLng, toLat, toLng);
  }
}
