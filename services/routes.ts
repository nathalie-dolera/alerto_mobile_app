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

export interface RouteOption {
  id: string;
  points: RoutePoint[];
  distanceMeters: number;
  travelTimeSeconds: number;
  label: string;
  isFastest?: boolean;
}

export interface RoutePlan {
  points: RoutePoint[];
  distanceMeters: number;
  travelTimeSeconds: number;
  trafficDelaySeconds: number;
  trafficLengthMeters: number;
  trafficSegments: TrafficSegment[];
  isFallback?: boolean;
  isFastest?: boolean;
  alternatives?: RouteOption[];
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
    // Realistic PH urban commute speed (~15 km/h + 3 min signal buffer) matching Google Maps
    travelTimeSeconds: Math.max(120, Math.round(distanceMeters / 4.2) + 180),
    trafficDelaySeconds: 0,
    trafficLengthMeters: 0,
    trafficSegments: [],
    isFallback: true,
    alternatives: [],
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

async function fetchMapboxRoutePlan(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  signal?: AbortSignal
): Promise<RoutePlan | null> {
  const MAPBOX_KEY = process.env.EXPO_PUBLIC_MAPBOX_API_KEY;
  if (!MAPBOX_KEY || signal?.aborted) return null;

  const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${fromLng},${fromLat};${toLng},${toLat}?alternatives=true&geometries=geojson&overview=full&steps=true&access_token=${MAPBOX_KEY}`;
  
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch Mapbox route: ${response.status}`);
  }

  const data = await response.json();
  if (!data?.routes || data.routes.length === 0) {
    return null;
  }

  const parseRoute = (routeData: any, idx: number): RouteOption => {
    const rawCoords: [number, number][] = routeData.geometry?.coordinates || [];
    const points: RoutePoint[] = rawCoords.map(c => ({ lat: c[1], lng: c[0] }));
    const distanceMeters = routeData.distance || calculateDistanceMeters(fromLat, fromLng, toLat, toLng);
    // Apply realistic PH city traffic buffer (traffic signals, intersection stops) to match Google Maps ETA
    const rawDuration = routeData.duration || Math.max(60, distanceMeters / 6);
    const calibratedDuration = Math.round(rawDuration * 1.25 + 120);

    return {
      id: idx === 0 ? 'primary' : `alt_${idx}`,
      points,
      distanceMeters,
      travelTimeSeconds: calibratedDuration,
      label: idx === 0
        ? `Fastest • ${Math.max(1, Math.round(calibratedDuration / 60))} min`
        : `Alternate • ${Math.max(1, Math.round(calibratedDuration / 60))} min`,
    };
  };

  const allRoutes = data.routes.map(parseRoute).sort((a: RouteOption, b: RouteOption) => a.travelTimeSeconds - b.travelTimeSeconds);
  const bestRoute = allRoutes[0];
  const alternatives = allRoutes.slice(1);

  return {
    points: bestRoute.points,
    distanceMeters: bestRoute.distanceMeters,
    travelTimeSeconds: bestRoute.travelTimeSeconds,
    trafficDelaySeconds: 0,
    trafficLengthMeters: 0,
    trafficSegments: [],
    alternatives,
  };
}

async function fetchOsrmRoutePlan(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  signal?: AbortSignal
): Promise<RoutePlan | null> {
  if (signal?.aborted) return null;
  const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson&alternatives=true`;
  
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch OSRM route: ${response.status}`);
  }

  const data = await response.json();
  if (!data?.routes || data.routes.length === 0) {
    return null;
  }

  const parseRoute = (routeData: any, idx: number): RouteOption => {
    const rawCoords: [number, number][] = routeData.geometry?.coordinates || [];
    const points: RoutePoint[] = rawCoords.map(c => ({ lat: c[1], lng: c[0] }));
    const distanceMeters = routeData.distance || calculateDistanceMeters(fromLat, fromLng, toLat, toLng);
    // Apply 1.65x multiplier + 180s buffer to OSRM free-flow speed to accurately reflect PH city driving & traffic lights
    const rawDuration = routeData.duration || Math.max(60, distanceMeters / 6);
    const calibratedDuration = Math.round(rawDuration * 1.65 + 180);

    return {
      id: idx === 0 ? 'primary' : `alt_${idx}`,
      points,
      distanceMeters,
      travelTimeSeconds: calibratedDuration,
      label: idx === 0
        ? `Fastest • ${Math.max(1, Math.round(calibratedDuration / 60))} min`
        : `Alternate • ${Math.max(1, Math.round(calibratedDuration / 60))} min`,
    };
  };

  const allRoutes = data.routes.map(parseRoute).sort((a: RouteOption, b: RouteOption) => a.travelTimeSeconds - b.travelTimeSeconds);
  const bestRoute = allRoutes[0];
  const alternatives = allRoutes.slice(1);

  return {
    points: bestRoute.points,
    distanceMeters: bestRoute.distanceMeters,
    travelTimeSeconds: bestRoute.travelTimeSeconds,
    trafficDelaySeconds: 0,
    trafficLengthMeters: 0,
    trafficSegments: [],
    alternatives,
  };
}

async function fetchStadiaRoutePlan(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  signal?: AbortSignal
): Promise<RoutePlan | null> {
  const STADIA_KEY = process.env.EXPO_PUBLIC_STADIA_API_KEY;
  if (!STADIA_KEY || signal?.aborted) throw new Error("Missing Stadia API key or aborted");

  const url = `https://api.stadiamaps.com/route/v1?api_key=${STADIA_KEY}`;
  const payload = {
    locations: [
      { lat: fromLat, lon: fromLng },
      { lat: toLat, lon: toLng }
    ],
    costing: "auto",
    costing_options: {
      auto: {
        use_highways: 0.5,
        use_tolls: 0.5
      }
    },
    alternates: 3, // Request more alternate routes
    units: "kilometers"
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
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
  const distanceMeters = trip.summary?.length ? trip.summary.length * 1000 : calculateDistanceMeters(fromLat, fromLng, toLat, toLng);
  // Apply a 1.65x + 180s factor to Valhalla free-flow ETAs to accurately reflect real PH city traffic & signals (matching Google Maps ETA)
  const rawTravelTime = trip.summary?.time || Math.max(60, Math.round(distanceMeters / 6.5));
  const travelTimeSeconds = Math.round(rawTravelTime * 1.65 + 180);

  const alternatives: RouteOption[] = [];
  if (Array.isArray(data?.alternates)) {
    data.alternates.forEach((alt: any, idx: number) => {
      const altTrip = alt?.trip;
      const altLeg = altTrip?.legs?.[0];
      if (altLeg?.shape) {
        const altPoints = decodePolyline(altLeg.shape, 6);
        const altDist = altTrip.summary?.length ? altTrip.summary.length * 1000 : distanceMeters;
        const altRawTime = altTrip.summary?.time || rawTravelTime;
        const altTime = Math.round(altRawTime * 1.65 + 180);
        const mins = Math.max(1, Math.round(altTime / 60));
        alternatives.push({
          id: `alt_${idx + 1}`,
          points: altPoints,
          distanceMeters: altDist,
          travelTimeSeconds: altTime,
          label: `Alternate • ${mins} min`,
        });
      }
    });
  }

  // Combine primary and alternatives, then sort by travelTimeSeconds (lowest minutes first as planned route)
  const allRoutes = [
    {
      id: 'primary',
      points,
      distanceMeters,
      travelTimeSeconds,
      label: `Fastest • ${Math.max(1, Math.round(travelTimeSeconds / 60))} min`,
    },
    ...alternatives
  ].sort((a, b) => a.travelTimeSeconds - b.travelTimeSeconds);

  const bestRoute = allRoutes[0];
  const remainingAlternatives = allRoutes.slice(1);

  return {
    points: bestRoute.points,
    distanceMeters: bestRoute.distanceMeters,
    travelTimeSeconds: bestRoute.travelTimeSeconds,
    trafficDelaySeconds: 0,
    trafficLengthMeters: 0,
    trafficSegments: [],
    alternatives: remainingAlternatives,
  };
}

export async function fetchRoutePlan(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  signal?: AbortSignal
): Promise<RoutePlan | null> {
  if (signal?.aborted) return null;
  // 1. Query Mapbox and OSRM concurrently for maximum speed & multiple distinct route choices
  try {
    const [mapboxResult, osrmResult] = await Promise.allSettled([
      fetchMapboxRoutePlan(fromLat, fromLng, toLat, toLng, signal),
      fetchOsrmRoutePlan(fromLat, fromLng, toLat, toLng, signal),
    ]);

    if (signal?.aborted) return null;

    const candidates: RouteOption[] = [];

    if (mapboxResult.status === 'fulfilled' && mapboxResult.value?.points?.length) {
      const mbPlan = mapboxResult.value;
      candidates.push({
        id: 'mb_primary',
        points: mbPlan.points,
        distanceMeters: mbPlan.distanceMeters,
        travelTimeSeconds: mbPlan.travelTimeSeconds,
        label: '',
      });
      if (mbPlan.alternatives && mbPlan.alternatives.length > 0) {
        candidates.push(...mbPlan.alternatives);
      }
    }

    if (osrmResult.status === 'fulfilled' && osrmResult.value?.points?.length) {
      const osrmPlan = osrmResult.value;
      candidates.push({
        id: 'osrm_primary',
        points: osrmPlan.points,
        distanceMeters: osrmPlan.distanceMeters,
        travelTimeSeconds: osrmPlan.travelTimeSeconds,
        label: '',
      });
      if (osrmPlan.alternatives && osrmPlan.alternatives.length > 0) {
        candidates.push(...osrmPlan.alternatives);
      }
    }

    if (candidates.length > 0) {
      // Deduplicate candidates that have nearly identical distance (<80m difference) and duration (<45s)
      const uniqueRoutes: RouteOption[] = [];
      for (const cand of candidates) {
        const isDuplicate = uniqueRoutes.some(
          existing => Math.abs(existing.distanceMeters - cand.distanceMeters) < 80 &&
                      Math.abs(existing.travelTimeSeconds - cand.travelTimeSeconds) < 45
        );
        if (!isDuplicate) {
          uniqueRoutes.push(cand);
        }
      }

      // Sort by travelTimeSeconds so the fastest route is ALWAYS index 0
      uniqueRoutes.sort((a, b) => a.travelTimeSeconds - b.travelTimeSeconds);

      const best = uniqueRoutes[0];
      const alternatives: RouteOption[] = uniqueRoutes.slice(1, 4).map((alt, idx) => {
        const mins = Math.max(1, Math.round(alt.travelTimeSeconds / 60));
        return {
          ...alt,
          id: `alt_${idx + 1}`,
          label: `Alternate • ${mins} min`,
          isFastest: false,
        };
      });

      return {
        points: best.points,
        distanceMeters: best.distanceMeters,
        travelTimeSeconds: best.travelTimeSeconds,
        trafficDelaySeconds: 0,
        trafficLengthMeters: 0,
        trafficSegments: [],
        isFastest: true,
        alternatives,
      };
    }
  } catch (err) {
    if (signal?.aborted) return null;
    console.warn('Concurrent route fetching error:', err);
  }

  // 2. Try Stadia Maps Valhalla API
  try {
    if (signal?.aborted) return null;
    const stadiaRoute = await fetchStadiaRoutePlan(fromLat, fromLng, toLat, toLng, signal);
    if (stadiaRoute && stadiaRoute.points && stadiaRoute.points.length >= 2) {
      return stadiaRoute;
    }
  } catch (stadiaError) {
    if (signal?.aborted) return null;
    console.warn(`fetchRoutePlan Stadia warning:`, stadiaError);
  }

  // 3. Fallback to backend API
  try {
    if (signal?.aborted) return null;
    const params = new URLSearchParams({
      fromLat: String(fromLat),
      fromLng: String(fromLng),
      toLat: String(toLat),
      toLng: String(toLng),
    });
    const response = await fetch(`${API_URL}/routes?${params.toString()}`, { signal });
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.warn(`fetchRoutePlan backend warning:`, error);
  }

  // 4. Fallback local build
  return buildFallbackRoutePlan(fromLat, fromLng, toLat, toLng);
}

