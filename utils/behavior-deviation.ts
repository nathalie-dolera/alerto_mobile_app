import { calculateDistance } from './location';

export type SafetyStatus = 'Normal' | 'Suspicious' | 'Alert-Triggered' | 'Arrived' | 'Cancelled';

export type BehaviorTriggerType = 'IDLE_TIME' | 'OFF_ROUTE' | 'MOVEMENT_LOSS';

export type RouteRecognitionStatus =
  | 'Planned Route'
  | 'Refreshed Route'
  | 'Unrecognized Route'
  | 'Confirmed Reroute';

export interface CoordinatePoint {
  lat: number;
  lng: number;
}

export interface BehaviorThresholds {
  idleMs: number;
  offRouteMeters: number;
  movementLossMs: number;
  minMovementMeters: number;
}

export interface BehaviorSnapshot {
  now: number;
  current: CoordinatePoint;
  destination: CoordinatePoint;
  start?: CoordinatePoint | null;
  routePoints?: CoordinatePoint[];
  routeDistanceMeters?: number;
  lastLocationUpdateAt?: number | null;
  lastMovedAt?: number | null;
  lastKnownCoords?: CoordinatePoint | null;
}

export interface BehaviorMetrics {
  idleDurationMs: number;
  movementLossDurationMs: number;
  offRouteMeters: number;
  distanceToDestinationMeters: number;
}

export interface BehaviorEvaluation {
  triggers: BehaviorTriggerType[];
  metrics: BehaviorMetrics;
}

export const DEFAULT_BEHAVIOR_THRESHOLDS: BehaviorThresholds = {
  idleMs: 3 * 60 * 1000, // 3 minutes for long stop detection
  offRouteMeters: 25, // 25m detects immediate departure from planned route onto another street
  movementLossMs: 3 * 60 * 1000, // 3 minutes
  minMovementMeters: 15, // 15m drift filter (ignores phone GPS jitter < 15m)
};

function projectToMeters(point: CoordinatePoint, referenceLat: number) {
  const radians = Math.PI / 180;
  const earthRadius = 6371000;

  return {
    x: point.lng * radians * earthRadius * Math.cos(referenceLat * radians),
    y: point.lat * radians * earthRadius,
  };
}

function projectPointOnSegment(
  point: CoordinatePoint,
  start: CoordinatePoint,
  end: CoordinatePoint
): { distance: number; snapped: CoordinatePoint } {
  const referenceLat = (start.lat + end.lat + point.lat) / 3;
  const p = projectToMeters(point, referenceLat);
  const a = projectToMeters(start, referenceLat);
  const b = projectToMeters(end, referenceLat);

  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abLengthSquared = abx * abx + aby * aby;

  if (abLengthSquared === 0) {
    return { distance: Math.hypot(p.x - a.x, p.y - a.y), snapped: start };
  }

  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / abLengthSquared));
  const nearestX = a.x + abx * t;
  const nearestY = a.y + aby * t;

  return {
    distance: Math.hypot(p.x - nearestX, p.y - nearestY),
    snapped: {
      lat: start.lat + (end.lat - start.lat) * t,
      lng: start.lng + (end.lng - start.lng) * t,
    },
  };
}

function distanceToSegmentMeters(
  point: CoordinatePoint,
  start: CoordinatePoint,
  end: CoordinatePoint
) {
  return projectPointOnSegment(point, start, end).distance;
}

export function getOffRouteDistanceMeters(
  current: CoordinatePoint,
  start: CoordinatePoint | null | undefined,
  destination: CoordinatePoint,
  routePoints?: CoordinatePoint[]
) {
  if (routePoints && routePoints.length >= 2) {
    let nearest = Number.POSITIVE_INFINITY;

    for (let index = 0; index < routePoints.length - 1; index += 1) {
      const candidate = distanceToSegmentMeters(current, routePoints[index], routePoints[index + 1]);
      if (candidate < nearest) {
        nearest = candidate;
      }
    }

    return nearest;
  }

  // If no polyline route exists yet, do NOT calculate off-route distance
  // (avoiding false alarms caused by measuring direct distance to destination)
  return 0;
}

export function calculateRemainingRouteDistanceMeters(
  current: CoordinatePoint,
  destination: CoordinatePoint,
  routePoints?: CoordinatePoint[],
  routeDistanceMeters?: number
): number {
  const directMeters = Math.round(calculateDistance(current.lat, current.lng, destination.lat, destination.lng));

  if (!routePoints || routePoints.length < 2) {
    return directMeters;
  }

  let minSegmentIndex = 0;
  let minDistance = Number.POSITIVE_INFINITY;
  let bestSnappedPoint: CoordinatePoint = current;

  // Calculate total polyline chord distance
  let totalPolylineMeters = 0;
  for (let i = 0; i < routePoints.length - 1; i += 1) {
    totalPolylineMeters += calculateDistance(
      routePoints[i].lat,
      routePoints[i].lng,
      routePoints[i + 1].lat,
      routePoints[i + 1].lng
    );
  }

  for (let i = 0; i < routePoints.length - 1; i += 1) {
    const { distance, snapped } = projectPointOnSegment(current, routePoints[i], routePoints[i + 1]);
    if (distance < minDistance) {
      minDistance = distance;
      minSegmentIndex = i;
      bestSnappedPoint = snapped;
    }
  }

  // Distance from snapped point along current segment to its end
  let remainingPolylineMeters = calculateDistance(
    bestSnappedPoint.lat,
    bestSnappedPoint.lng,
    routePoints[minSegmentIndex + 1].lat,
    routePoints[minSegmentIndex + 1].lng
  );

  // Remaining distance along all subsequent route segments to destination
  for (let i = minSegmentIndex + 1; i < routePoints.length - 1; i += 1) {
    remainingPolylineMeters += calculateDistance(
      routePoints[i].lat,
      routePoints[i].lng,
      routePoints[i + 1].lat,
      routePoints[i + 1].lng
    );
  }

  let calculatedMeters = Math.round(remainingPolylineMeters);
  // If we have an official road route distance, scale proportionally with progress along polyline
  if (routeDistanceMeters && routeDistanceMeters > 0 && totalPolylineMeters > 0) {
    const ratio = Math.min(1, Math.max(0, remainingPolylineMeters / totalPolylineMeters));
    calculatedMeters = Math.round(ratio * routeDistanceMeters);
  }

  // Remaining route distance can never physically be less than direct straight-line distance to destination
  return Math.max(directMeters, calculatedMeters);
}


export function evaluateBehaviorDeviation(
  snapshot: BehaviorSnapshot,
  thresholds: BehaviorThresholds = DEFAULT_BEHAVIOR_THRESHOLDS
): BehaviorEvaluation {
  const idleDurationMs = snapshot.lastMovedAt ? Math.max(0, snapshot.now - snapshot.lastMovedAt) : 0;
  const movementLossDurationMs = snapshot.lastLocationUpdateAt
    ? Math.max(0, snapshot.now - snapshot.lastLocationUpdateAt)
    : 0;
  const offRouteMeters = getOffRouteDistanceMeters(
    snapshot.current,
    snapshot.start,
    snapshot.destination,
    snapshot.routePoints
  );
  const distanceToDestinationMeters = calculateRemainingRouteDistanceMeters(
    snapshot.current,
    snapshot.destination,
    snapshot.routePoints,
    snapshot.routeDistanceMeters
  );

  const triggers: BehaviorTriggerType[] = [];

  if (idleDurationMs >= thresholds.idleMs && distanceToDestinationMeters > thresholds.minMovementMeters) {
    triggers.push('IDLE_TIME');
  }

  // Only trigger OFF_ROUTE if we have valid route polyline points and user is truly beyond threshold
  const hasValidRoute = Boolean(snapshot.routePoints && snapshot.routePoints.length >= 2);
  if (
    hasValidRoute &&
    offRouteMeters >= thresholds.offRouteMeters &&
    distanceToDestinationMeters > thresholds.minMovementMeters &&
    idleDurationMs < thresholds.idleMs
  ) {
    triggers.push('OFF_ROUTE');
  }

  if (
    movementLossDurationMs >= thresholds.movementLossMs &&
    distanceToDestinationMeters > thresholds.minMovementMeters &&
    snapshot.lastKnownCoords
  ) {
    triggers.push('MOVEMENT_LOSS');
  }

  return {
    triggers,
    metrics: {
      idleDurationMs,
      movementLossDurationMs,
      offRouteMeters,
      distanceToDestinationMeters,
    },
  };
}

export function formatBehaviorTrigger(trigger: BehaviorTriggerType) {
  switch (trigger) {
    case 'IDLE_TIME':
      return 'Idle time exceeded';
    case 'OFF_ROUTE':
      return 'Route variance detected';
    case 'MOVEMENT_LOSS':
      return 'Movement signal lost';
    default:
      return trigger;
  }
}

export function isPointNearRoute(
  point: CoordinatePoint,
  routePoints: CoordinatePoint[] | undefined,
  thresholdMeters: number
) {
  if (!routePoints || routePoints.length < 2) {
    return false;
  }

  return getOffRouteDistanceMeters(point, null, routePoints[routePoints.length - 1], routePoints) <= thresholdMeters;
}
