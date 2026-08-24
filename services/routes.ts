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

/**
 * Decodes an encoded polyline string into an array of LatLng coordinates.
 * Valhalla (Stadia Maps) uses a precision of 6 by default.
 */
function decodePolyline(str: string, precision = 6): RoutePoint[] {
  let index = 0, lat = 0, lng = 0;
  const coordinates: RoutePoint[] = [];
  const factor = Math.pow(10, precision);

  while (index < str.length) {
      let shift = 0, result = 0, byte;
      do {
          byte = str.charCodeAt(index++) - 63;
          result |= (byte & 0x1f) << shift;
          shift += 5;
      } while (byte >= 0x20);
      const latitude_change = ((result & 1) ? ~(result >> 1) : (result >> 1));
      
      shift = result = 0;
      do {
          byte = str.charCodeAt(index++) - 63;
          result |= (byte & 0x1f) << shift;
          shift += 5;
      } while (byte >= 0x20);
      const longitude_change = ((result & 1) ? ~(result >> 1) : (result >> 1));
      
      lat += latitude_change;
      lng += longitude_change;
      coordinates.push({ lat: lat / factor, lng: lng / factor });
  }
  return coordinates;
}

async function fetchStadiaRoutePlan(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): Promise<RoutePlan | null> {
  const STADIA_KEY = process.env.EXPO_PUBLIC_STADIA_API_KEY;
  if (!STADIA_KEY) throw new Error("Missing Stadia API key");

  const url = `https://api.stadiamaps.com/route/v1?api_key=${STADIA_KEY}`;
  const payload = {
    locations: [
      { lat: fromLat, lon: fromLng },
      { lat: toLat, lon: toLng }
    ],
    costing: "auto",
    alternatives: 2, // Request alternate routes (though we only map the primary one to the blue line for now)
    units: "kilometers"
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Stadia route plan: ${response.status}`);
  }

  const data = await response.json();
  const trip = data?.trip;
  const primaryLeg = trip?.legs?.[0];
  
  if (!primaryLeg || !primaryLeg.shape) {
    return null;
  }

  const points = decodePolyline(primaryLeg.shape, 6);
  
  // distance in kilometers * 1000 = meters
  const distanceMeters = trip.summary?.length ? trip.summary.length * 1000 : calculateDistanceMeters(fromLat, fromLng, toLat, toLng);
  const travelTimeSeconds = trip.summary?.time || Math.max(60, Math.round(distanceMeters / 8.33));

  return {
    points,
    distanceMeters,
    travelTimeSeconds,
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
    console.warn(`fetchRoutePlan warning (from ${fromLat},${fromLng} to ${toLat},${toLng}), trying Stadia route:`, error);
    try {
      const stadiaRoute = await fetchStadiaRoutePlan(fromLat, fromLng, toLat, toLng);

      if (stadiaRoute) {
        return stadiaRoute;
      }
    } catch (stadiaError) {
      console.warn(`fetchRoutePlan Stadia warning (from ${fromLat},${fromLng} to ${toLat},${toLng}), using fallback route:`, stadiaError);
    }

    return buildFallbackRoutePlan(fromLat, fromLng, toLat, toLng);
  }
}
