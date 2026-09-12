const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://alerto-web-system.vercel.app/api/mobile';

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
  const bestRoute = { ...allRoutes[0], isFastest: true };
  const alternatives = allRoutes.slice(1).map((alt: RouteOption, idx: number) => ({
    ...alt,
    id: `alt_${idx + 1}`,
    isFastest: false,
    label: `Alternate • ${Math.max(1, Math.round(alt.travelTimeSeconds / 60))} min`,
  }));

  return {
    points: bestRoute.points,
    distanceMeters: bestRoute.distanceMeters,
    travelTimeSeconds: bestRoute.travelTimeSeconds,
    trafficDelaySeconds: 0,
    trafficLengthMeters: 0,
    trafficSegments: [],
    isFastest: true,
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

  // 1. Primary: Mapbox driving-traffic with alternatives (blazing fast ~250ms, real-time PH road network)
  try {
    const mbController = new AbortController();
    const timeoutId = setTimeout(() => mbController.abort(), 4000);
    if (signal) {
      signal.addEventListener('abort', () => mbController.abort(), { once: true });
    }
    const mapboxPlan = await fetchMapboxRoutePlan(fromLat, fromLng, toLat, toLng, mbController.signal);
    clearTimeout(timeoutId);

    if (mapboxPlan && mapboxPlan.points && mapboxPlan.points.length >= 2) {
      return mapboxPlan;
    }
  } catch (err) {
    if (signal?.aborted) return null;
    console.warn('Mapbox route plan warning, checking secondary providers:', err);
  }

  // 2. Secondary: Stadia Maps Valhalla API
  try {
    if (signal?.aborted) return null;
    const stadiaController = new AbortController();
    const timeoutId = setTimeout(() => stadiaController.abort(), 4000);
    if (signal) {
      signal.addEventListener('abort', () => stadiaController.abort(), { once: true });
    }
    const stadiaRoute = await fetchStadiaRoutePlan(fromLat, fromLng, toLat, toLng, stadiaController.signal);
    clearTimeout(timeoutId);

    if (stadiaRoute && stadiaRoute.points && stadiaRoute.points.length >= 2) {
      return stadiaRoute;
    }
  } catch (stadiaError) {
    if (signal?.aborted) return null;
    console.warn('Stadia route plan warning:', stadiaError);
  }

  // 3. Tertiary: OSRM (guarded by 4s timeout so it never causes long UI freezes)
  try {
    if (signal?.aborted) return null;
    const osrmController = new AbortController();
    const timeoutId = setTimeout(() => osrmController.abort(), 4000);
    if (signal) {
      signal.addEventListener('abort', () => osrmController.abort(), { once: true });
    }
    const osrmPlan = await fetchOsrmRoutePlan(fromLat, fromLng, toLat, toLng, osrmController.signal);
    clearTimeout(timeoutId);

    if (osrmPlan && osrmPlan.points && osrmPlan.points.length >= 2) {
      return osrmPlan;
    }
  } catch (osrmError) {
    if (signal?.aborted) return null;
    console.warn('OSRM route plan warning:', osrmError);
  }

  // 4. Quaternary: Backend API
  try {
    if (signal?.aborted) return null;
    const params = new URLSearchParams({
      fromLat: String(fromLat),
      fromLng: String(fromLng),
      toLat: String(toLat),
      toLng: String(toLng),
    });
    const backendController = new AbortController();
    const timeoutId = setTimeout(() => backendController.abort(), 3500);
    if (signal) {
      signal.addEventListener('abort', () => backendController.abort(), { once: true });
    }
    const response = await fetch(`${API_URL}/routes?${params.toString()}`, { signal: backendController.signal });
    clearTimeout(timeoutId);
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.warn('Backend route warning:', error);
  }

  // 5. Fallback local build
  return buildFallbackRoutePlan(fromLat, fromLng, toLat, toLng);
}

