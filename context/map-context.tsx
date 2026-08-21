import { LocationPermissionModal } from '@/components/ui/location-permission-modal';
import { useAuth } from '@/context/auth';
import { useBleContext } from '@/context/ble-context';
import { useHistoryContext } from '@/context/history-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Alert, Keyboard, Linking, Platform } from 'react-native';
import { EmergencyService } from '../services/emergency-service';
import { fetchHazards, fetchRiskHeatmap, HazardPoint, RiskHeatmapPoint } from '../services/hazards';
import { fetchRoutePlan, RoutePlan, RoutePoint } from '../services/routes';
import { SmsService } from '../services/sms-service';
import { AlarmPreferenceInput, buildBagAlarmSettings } from '../utils/alarm-settings';
import {
  BehaviorMetrics,
  BehaviorTriggerType,
  DEFAULT_BEHAVIOR_THRESHOLDS,
  evaluateBehaviorDeviation,
  formatBehaviorTrigger,
  isPointNearRoute,
  RouteRecognitionStatus,
  SafetyStatus,
} from '../utils/behavior-deviation';
import {
  calculateDistance,
  formatCoordinateFallbackLabel,
  formatSearchResultLabel,
  getLabelFromPlacemark,
  getLabelFromReverseGeocodeResult,
} from '../utils/location';
import { requestNotificationPermissions, sendLocalNotification } from '../utils/notifications';
import { isPhilippinesSearchResult, isWithinPhilippinesBounds, PHILIPPINES_CENTER } from '../utils/philippines';


const _HEARTBEAT_LOCALHOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
const HEARTBEAT_API_URL = process.env.EXPO_PUBLIC_API_URL || `http://${_HEARTBEAT_LOCALHOST}:3000/api/mobile`;

async function sendCommuteHeartbeat(
  userId: string,
  active: boolean,
  safetyStatus?: string,
  lat?: number,
  lng?: number,
  anomalyTriggers?: string[],
  tripStartTime?: number
) {
  try {
    await fetch(`${HEARTBEAT_API_URL}/commute/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        active,
        safetyStatus,
        lat,
        lng,
        anomalyTriggers,
        tripStartTime,
      }),
    });
  } catch (e) {
    console.warn('Commute heartbeat failed:', e);
  }
}

const ARRIVAL_RADIUS_METERS = 30;

export type DriverStopType = 'GAS_STATION' | 'TOLL_GATE' | 'REST_AREA' | 'TRAFFIC' | 'CUSTOM';

const DRIVER_STOP_KEYWORDS: Record<DriverStopType, string[]> = {
  GAS_STATION: ['gas', 'gasoline', 'petron', 'shell', 'caltex', 'total', 'seaoil', 'cleanfuel', 'petrol', 'fuel', 'unioil', 'flying v', 'jetti'],
  TOLL_GATE: ['toll', 'tollgate', 'toll gate', 'toll plaza', 'nlex', 'slex', 'tplex', 'sctex', 'calax', 'cavitex', 'skyway'],
  REST_AREA: ['rest area', 'rest stop', 'restroom', 'bathroom', 'cr', 'comfort room', 'stopover'],
  TRAFFIC: ['traffic', 'intersection', 'checkpoint'],
  CUSTOM: [],
};

const DRIVER_STOP_DURATIONS: Record<DriverStopType, number> = {
  GAS_STATION: 15 * 60 * 1000,
  TOLL_GATE: 5 * 60 * 1000,
  REST_AREA: 15 * 60 * 1000,
  TRAFFIC: 10 * 60 * 1000,
  CUSTOM: 15 * 60 * 1000,
};

const DRIVER_STOP_LABELS: Record<DriverStopType, string> = {
  GAS_STATION: 'Gas Station Stop',
  TOLL_GATE: 'Toll Gate',
  REST_AREA: 'Rest Area / Bathroom Break',
  TRAFFIC: 'Traffic / Checkpoint',
  CUSTOM: 'Driver Stop',
};

function detectDriverStopType(locationName: string): DriverStopType | null {
  const lower = locationName.toLowerCase();
  for (const [type, keywords] of Object.entries(DRIVER_STOP_KEYWORDS) as [DriverStopType, string[]][]) {
    if (type === 'CUSTOM') continue;
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        return type;
      }
    }
  }
  return null;
}

interface RecentSearch {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface Suggestion {
  id: string;
  name: string;
  lat: number;
  lng: number;
  displayName: string;
}

interface MapContextType {
  region: [number, number];
  currentCoords: [number, number] | null;
  zoomLevel: number;
  locationName: string;
  recentSearches: RecentSearch[];
  searchQuery: string;
  favorites: string[];
  setRegion: (coords: [number, number]) => void;
  setZoomLevel: React.Dispatch<React.SetStateAction<number>>;
  setLocationName: (name: string) => void;
  setSearchQuery: (query: string) => void;
  suggestions: Suggestion[];
  setSuggestions: (suggestions: Suggestion[]) => void;
  fetchSuggestions: (query: string) => Promise<void>;
  setRecentSearches: React.Dispatch<React.SetStateAction<RecentSearch[]>>;
  reverseGeocode: (coords: [number, number]) => Promise<void>;
  handleSearch: () => Promise<void>;
  handleLocateMe: () => Promise<void>;
  toggleFavorite: (name: string) => void;
  addToRecent: (name: string, lat: number, lng: number) => void;
  clearRecentSearches: () => void;
  isAlarmActive: boolean;
  activeAlarmDestination: string;
  activeAlarmThresholdMeters: number | null;
  startAlarm: (
    destinationName: string,
    lat: number,
    lng: number,
    thresholdMeters: number,
    preferences?: AlarmPreferenceInput
  ) => Promise<void>;
  stopAlarm: () => void;
  confirmSafety: () => void;
  hazardPoints: HazardPoint[];
  riskHeatmapPoints: RiskHeatmapPoint[];
  activeRoute: RoutePlan | null;
  refreshRoutePlan: (destination?: { lat: number; lng: number } | null, clearIfMissing?: boolean) => Promise<void>;
  routeRecognitionStatus: RouteRecognitionStatus;
  routeRefreshCount: number;
  safetyStatus: SafetyStatus;
  anomalyTriggers: BehaviorTriggerType[];
  monitoringMetrics: BehaviorMetrics | null;
  safetyCheckDeadlineAt: number | null;
  triggerEmergency: (reason: string) => Promise<void>;
  isDriverStopActive: boolean;
  driverStopReason: string | null;
  driverStopType: DriverStopType | null;
  driverStopSnoozeUntil: number | null;
  startDriverStop: (reason: string, stopType: DriverStopType, durationMinutes?: number) => void;
  endDriverStop: () => void;
  simulateAnomaly?: (type: 'OFF_ROUTE' | 'IDLE_TIME') => void;
}

const MapContext = createContext<MapContextType | undefined>(undefined);

function isNetworkRequestFailure(error: unknown) {
  return error instanceof Error && (
    error.message.includes('Network request failed') ||
    error.message.includes('Failed to fetch') ||
    error.message.includes('Load failed')
  );
}

export function MapProvider({ children }: { readonly children: React.ReactNode }) {
  const [region, setRegionState] = useState<[number, number]>(PHILIPPINES_CENTER);
  const [currentCoords, setCurrentCoords] = useState<[number, number] | null>(null);
  const [zoomLevel, setZoomLevel] = useState(15);
  const [locationName, setLocationName] = useState("Locating...");
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [isLocationModalVisible, setIsLocationModalVisible] = useState(false);
  const [isAlarmActive, setIsAlarmActive] = useState(false);
  const [activeAlarmDestination, setActiveAlarmDestination] = useState('');
  const [activeAlarmThresholdMeters, setActiveAlarmThresholdMeters] = useState<number | null>(null);
  const [destinationCoords, setDestinationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [hazardPoints, setHazardPoints] = useState<HazardPoint[]>([]);
  const [riskHeatmapPoints, setRiskHeatmapPoints] = useState<RiskHeatmapPoint[]>([]);
  const [activeRoute, setActiveRoute] = useState<RoutePlan | null>(null);
  const [routeRecognitionStatus, setRouteRecognitionStatus] = useState<RouteRecognitionStatus>('Planned Route');
  const [routeRefreshCount, setRouteRefreshCount] = useState(0);
  const [safetyStatus, setSafetyStatus] = useState<SafetyStatus>('Normal');
  const [anomalyTriggers, setAnomalyTriggers] = useState<BehaviorTriggerType[]>([]);
  const [monitoringMetrics, setMonitoringMetrics] = useState<BehaviorMetrics | null>(null);
  const [safetyCheckDeadlineAt, setSafetyCheckDeadlineAt] = useState<number | null>(null);
  const [isDriverStopActive, setIsDriverStopActive] = useState(false);
  const [driverStopReason, setDriverStopReason] = useState<string | null>(null);
  const [driverStopType, setDriverStopType] = useState<DriverStopType | null>(null);
  const [driverStopSnoozeUntil, setDriverStopSnoozeUntil] = useState<number | null>(null);
  const notifiedHazardsRef = useRef<Set<string>>(new Set());
  const notifiedArrivalRef = useRef<boolean>(false);
  const notifiedTriggerZoneRef = useRef<boolean>(false);
  const routeRefreshRef = useRef<{ at: number, coords: RoutePoint | null }>({ at: 0, coords: null });
  const driverStopAutoDetectedRef = useRef(false);
  const isPersistedDataLoadedRef = useRef(false);
  const isAutoReroutingRef = useRef(false);

  const tripSessionRef = useRef({
    startTime: 0,
    alertsCount: 0,
    unsafeZones: new Set<string>(),
    responseTimes: [] as number[],
    currentResponseStartTime: null as number | null,
    startCoords: null as { lat: number; lng: number } | null,
    lastKnownCoords: null as { lat: number; lng: number } | null,
    lastLocationUpdateAt: null as number | null,
    lastMovedAt: null as number | null,
    maxDeviationMeters: 0,
    anomalyCount: 0,
    anomalyTriggers: new Set<BehaviorTriggerType>(),
    anomalyReasonLog: [] as string[],
    safetyStatus: 'Normal' as SafetyStatus,
    suspiciousAt: null as number | null,
    sosTriggeredAt: null as number | null,
    safetyCheckDeadlineAt: null as number | null,
    activeSafetyTriggerKey: null as string | null,
    routeRecognitionStatus: 'Planned Route' as RouteRecognitionStatus,
    routeRefreshCount: 0,
  });

  const { user } = useAuth();
  const { addTrip } = useHistoryContext();
  const { sendSettings, sendDestinationAlert, sendDestinationStop } = useBleContext();

  const setRegion = useCallback((coords: [number, number]) => {
    if (!isWithinPhilippinesBounds(coords)) {
      Alert.alert('Philippines Only', 'Please choose a location within the Philippines.');
      return;
    }

    setRegionState(coords);
  }, []);

  const addToRecent = useCallback((name: string, lat: number, lng: number) => {
    if (!isWithinPhilippinesBounds([lng, lat])) {
      return;
    }

    setRecentSearches(prev => {
      const existingItem = prev.find(item => item.name === name);
      const isSameTopItem = (
        prev[0]?.name === name &&
        Math.abs((prev[0]?.lat ?? 0) - lat) < 0.00001 &&
        Math.abs((prev[0]?.lng ?? 0) - lng) < 0.00001
      );

      if (isSameTopItem) {
        return prev;
      }

      const filtered = prev.filter(item => item.name !== name);

      return [{
        id: existingItem?.id ?? Date.now().toString(),
        name,
        lat,
        lng,
      }, ...filtered];
    });
  }, []);

  const toggleFavorite = useCallback((name: string) => {
    setFavorites(prev => prev.includes(name) ? prev.filter(item => item !== name) : [...prev, name]);
  }, []);

  const triggerAutomaticSos = useCallback(async (reasonLabel: string) => {
    if (tripSessionRef.current.sosTriggeredAt) {
      return;
    }

    tripSessionRef.current.safetyStatus = 'SOS-Triggered';
    tripSessionRef.current.sosTriggeredAt = Date.now();
    tripSessionRef.current.safetyCheckDeadlineAt = null;
    setSafetyStatus('SOS-Triggered');
    setSafetyCheckDeadlineAt(null);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    sendLocalNotification(
      'Alerto Emergency Alert Triggered',
      `Emergency contacts are being notified. Reason: ${reasonLabel}.`
    );

    try {
      // Check user SMS preference before sending
      const smsPref = await AsyncStorage.getItem('alerto_sms_enabled');
      const smsEnabled = smsPref !== 'false'; // default: enabled

      const contacts = (await EmergencyService.getContacts()).filter(contact => contact.isSelected !== false);
      if (contacts.length === 0) {
        return;
      }

      if (!smsEnabled) {
        console.log('📵 SMS alerts are disabled by user preference. Skipping SMS dispatch.');
        return;
      }

      const current = tripSessionRef.current.lastKnownCoords;
      const locationUrl = current
        ? `https://alerto-web-system.vercel.app/map?lat=${current.lat}&lng=${current.lng}`
        : undefined;

      // Load active ride details from AsyncStorage
      let rideDetails = {
        bookingType: 'Behavior Deviation Detection',
        plateNumber: 'NONE',
        driverName: 'N/A',
        carModel: 'N/A',
      };

      try {
        const storedRide = await AsyncStorage.getItem('@active_ride_details');
        if (storedRide) {
          const parsed = JSON.parse(storedRide);
          rideDetails = {
            bookingType: parsed.bookingType || 'Behavior Deviation Detection',
            plateNumber: parsed.plateNumber || 'NONE',
            driverName: parsed.driverName || 'N/A',
            carModel: parsed.carModel || 'N/A',
          };
        }
      } catch (err) {
        console.error('Failed to load active ride details for SOS:', err);
      }

      const message = SmsService.formatEmergencyMessage({
        bookingType: rideDetails.bookingType,
        plateNumber: rideDetails.plateNumber,
        driverName: rideDetails.driverName,
        carModel: rideDetails.carModel,
        locationUrl,
        senderName: user?.name || user?.email || 'Alerto User',
        senderEmail: user?.email,
        isEmergency: true,
        incidentReason: reasonLabel,
      });

      for (const contact of contacts) {
        await SmsService.sendSms(contact.phoneNumber, message);
      }
    } catch (error) {
      console.error('Automatic SOS dispatch error:', error);
    }
  }, [user]);

  const activateSuspiciousState = useCallback(async (triggers: BehaviorTriggerType[]) => {
    const triggerKey = triggers.slice().sort().join('|');
    if (tripSessionRef.current.activeSafetyTriggerKey === triggerKey || tripSessionRef.current.sosTriggeredAt) {
      return;
    }

    const reasonLabel = triggers.map(formatBehaviorTrigger).join(', ');
    tripSessionRef.current.activeSafetyTriggerKey = triggerKey;
    tripSessionRef.current.safetyStatus = 'Suspicious';
    tripSessionRef.current.suspiciousAt ??= Date.now();
    tripSessionRef.current.safetyCheckDeadlineAt = Date.now() + 30_000;
    tripSessionRef.current.anomalyCount += 1;
    triggers.forEach(trigger => tripSessionRef.current.anomalyTriggers.add(trigger));
    tripSessionRef.current.anomalyReasonLog.push(reasonLabel);

    setSafetyStatus('Suspicious');
    setAnomalyTriggers(triggers);
    setSafetyCheckDeadlineAt(tripSessionRef.current.safetyCheckDeadlineAt);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    sendLocalNotification(
      'Safety Check Needed',
      `${reasonLabel}. Confirm you are safe within 30 seconds to avoid emergency escalation.`
    );

    // Only call sendSettings if it's expecting a notification string, not alarm settings
    // Remove this line if sendSettings only handles AlarmSettings:
    // await sendSettings(reasonLabel);
  }, [sendSettings]);

  const startDriverStop = useCallback((reason: string, stopType: DriverStopType, durationMinutes?: number) => {
    const durationMs = durationMinutes
      ? durationMinutes * 60 * 1000
      : DRIVER_STOP_DURATIONS[stopType];
    const snoozeUntil = Date.now() + durationMs;

    setIsDriverStopActive(true);
    setDriverStopReason(reason);
    setDriverStopType(stopType);
    setDriverStopSnoozeUntil(snoozeUntil);

    // If we were in suspicious state, clear it since this is a legitimate stop
    if (tripSessionRef.current.safetyStatus === 'Suspicious') {
      tripSessionRef.current.safetyStatus = 'Normal';
      tripSessionRef.current.safetyCheckDeadlineAt = null;
      tripSessionRef.current.activeSafetyTriggerKey = null;
      setSafetyStatus('Normal');
      setAnomalyTriggers([]);
      setSafetyCheckDeadlineAt(null);
    }

    // Keep timers fresh so idle/movement-loss won't re-trigger
    tripSessionRef.current.lastMovedAt = Date.now();
    tripSessionRef.current.lastLocationUpdateAt = Date.now();

    const label = DRIVER_STOP_LABELS[stopType];
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    sendLocalNotification(
      'Driver Stop Detected',
      `${label}: ${reason}. Monitoring paused for ${durationMinutes ?? Math.round(durationMs / 60000)} minutes.`
    );
  }, []);

  const endDriverStop = useCallback(() => {
    setIsDriverStopActive(false);
    setDriverStopReason(null);
    setDriverStopType(null);
    setDriverStopSnoozeUntil(null);
    driverStopAutoDetectedRef.current = false;

    // Reset timers so monitoring starts fresh
    tripSessionRef.current.lastMovedAt = Date.now();
    tripSessionRef.current.lastLocationUpdateAt = Date.now();

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    sendLocalNotification(
      'Monitoring Resumed',
      'Driver stop ended. Trip monitoring is active again.'
    );
  }, []);

  const processBehaviorMonitoring = useCallback((now = Date.now()) => {
    if (!isAlarmActive || !destinationCoords || !tripSessionRef.current.lastKnownCoords || notifiedArrivalRef.current) {
      return;
    }

    // If driver stop is active, keep timers fresh and skip anomaly checks
    if (isDriverStopActive) {
      tripSessionRef.current.lastMovedAt = now;
      tripSessionRef.current.lastLocationUpdateAt = now;

      // Auto-end if snooze expired
      if (driverStopSnoozeUntil && now >= driverStopSnoozeUntil) {
        endDriverStop();
      }
      return;
    }

    // Auto-detect driver stop from location name (only once per idle period)
    if (
      !driverStopAutoDetectedRef.current &&
      tripSessionRef.current.lastMovedAt &&
      (now - tripSessionRef.current.lastMovedAt) >= DEFAULT_BEHAVIOR_THRESHOLDS.idleMs
    ) {
      const detectedType = detectDriverStopType(locationName);
      if (detectedType) {
        driverStopAutoDetectedRef.current = true;
        const label = DRIVER_STOP_LABELS[detectedType];
        startDriverStop(label, detectedType);
        return;
      }
    }

    const evaluation = evaluateBehaviorDeviation(
      {
        now,
        current: tripSessionRef.current.lastKnownCoords,
        destination: destinationCoords,
        start: tripSessionRef.current.startCoords,
        routePoints: activeRoute?.points,
        lastLocationUpdateAt: tripSessionRef.current.lastLocationUpdateAt,
        lastMovedAt: tripSessionRef.current.lastMovedAt,
        lastKnownCoords: tripSessionRef.current.lastKnownCoords,
      },
      DEFAULT_BEHAVIOR_THRESHOLDS
    );

    tripSessionRef.current.maxDeviationMeters = Math.max(
      tripSessionRef.current.maxDeviationMeters,
      evaluation.metrics.offRouteMeters
    );

    setMonitoringMetrics(evaluation.metrics);

    if (evaluation.triggers.length > 0) {
      if (evaluation.triggers.includes('OFF_ROUTE')) {
        // Commuter is off planned route: attempt to calculate a new route to destination first
        if (!isAutoReroutingRef.current) {
          isAutoReroutingRef.current = true;
          void (async () => {
            try {
              const currentPoint = tripSessionRef.current.lastKnownCoords;
              if (currentPoint && destinationCoords) {
                const newRoute = await fetchRoutePlan(
                  currentPoint.lat,
                  currentPoint.lng,
                  destinationCoords.lat,
                  destinationCoords.lng
                );

                if (newRoute && !newRoute.isFallback) {
                  // A valid alternate route exists: reroute smoothly without alarming the user
                  setActiveRoute(newRoute);
                  setRouteRecognitionStatus('Confirmed Reroute');
                  tripSessionRef.current.routeRecognitionStatus = 'Confirmed Reroute';
                  sendLocalNotification('Commute Rerouted', 'Alerto has updated your commute path to match your new route.');
                  isAutoReroutingRef.current = false;
                  return;
                }
              }
            } catch (err) {
              console.warn('Auto-reroute attempt failed:', err);
            }

            // If no valid route to destination could be found (dead end, off-grid, moving opposite), trigger Safety Check
            isAutoReroutingRef.current = false;
            setRouteRecognitionStatus('Unrecognized Route');
            tripSessionRef.current.routeRecognitionStatus = 'Unrecognized Route';
            void activateSuspiciousState(evaluation.triggers);
          })();
        }
      } else {
        void activateSuspiciousState(evaluation.triggers);
      }
    }
  }, [isAlarmActive, destinationCoords, activeRoute, activateSuspiciousState, isDriverStopActive, driverStopSnoozeUntil, endDriverStop, startDriverStop, locationName]);

  const refreshRoutePlan = useCallback(async (
    destination?: { lat: number; lng: number } | null,
    clearIfMissing = false
  ) => {
    const routeDestination =
      destination === undefined
        ? destinationCoords
        : destination;
    if (!currentCoords || !routeDestination) {
      if (clearIfMissing) {
        setActiveRoute(null);
        setRouteRecognitionStatus('Unrecognized Route');
      }
      return;
    }

    const previousRoute = activeRoute;
    const currentPoint = { lat: currentCoords[1], lng: currentCoords[0] };
    const route = await fetchRoutePlan(
      currentCoords[1],
      currentCoords[0],
      routeDestination.lat,
      routeDestination.lng
    );
    if (!route) {
      setActiveRoute(null);
      setRouteRecognitionStatus('Unrecognized Route');
      tripSessionRef.current.routeRecognitionStatus = 'Unrecognized Route';
      return;
    }

    if (route.isFallback) {
      setActiveRoute(null);
      setRouteRecognitionStatus('Unrecognized Route');
      tripSessionRef.current.routeRecognitionStatus = 'Unrecognized Route';
      return;
    }

    let nextRouteStatus: RouteRecognitionStatus = 'Planned Route';
    if (previousRoute) {
      const wasOffPreviousRoute = !isPointNearRoute(
        currentPoint,
        previousRoute.points,
        DEFAULT_BEHAVIOR_THRESHOLDS.offRouteMeters
      );
      const isNearNewRoute = isPointNearRoute(
        currentPoint,
        route.points,
        DEFAULT_BEHAVIOR_THRESHOLDS.offRouteMeters
      );

      if (wasOffPreviousRoute && isNearNewRoute) {
        nextRouteStatus = 'Confirmed Reroute';
        if (isAlarmActive) {
          sendLocalNotification('Commute Rerouted', 'Alerto has updated your commute path to match a new route.');
        }
      } else {
        nextRouteStatus = 'Refreshed Route';
      }
    }

    setActiveRoute(route);
    setRouteRecognitionStatus(nextRouteStatus);
    tripSessionRef.current.routeRecognitionStatus = nextRouteStatus;
  }, [destinationCoords, currentCoords, activeRoute, isAlarmActive]);

  const reverseGeocode = useCallback(async (coords: [number, number]) => {
    if (!isWithinPhilippinesBounds(coords)) {
      setLocationName('Outside Philippines');
      return;
    }

    const fallbackLabel = formatCoordinateFallbackLabel(coords[1], coords[0]);

    try {
      setLocationName("Locating...");

      try {
        const nativeResultsPromise = Location.reverseGeocodeAsync({
          latitude: coords[1],
          longitude: coords[0],
        });
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Native reverse geocode timeout')), 2000)
        );
        const nativeResults = await Promise.race([nativeResultsPromise, timeoutPromise]) as Location.LocationGeocodedAddress[];
        const nativeLabel = getLabelFromPlacemark(nativeResults[0]);

        if (nativeLabel) {
          setLocationName(nativeLabel);
          addToRecent(nativeLabel, coords[1], coords[0]);
          return;
        }
      } catch (nativeError) {
        console.warn('Native reverse geocoding failed or timed out:', nativeError);
      }

      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&accept-language=en&lon=${coords[0]}&lat=${coords[1]}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'AlertoApp/1.0',
            'Accept-Language': 'en',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const resolvedLabel = getLabelFromReverseGeocodeResult(data);

        if (resolvedLabel) {
          setLocationName(resolvedLabel);
          addToRecent(resolvedLabel, coords[1], coords[0]);
          return;
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);

        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          console.warn('⏱️ Reverse geocoding timeout - using fallback');
        } else if (fetchError instanceof Error && fetchError.message.includes('HTTP')) {
          console.warn('🌐 Nominatim API error:', fetchError.message);
        } else if (isNetworkRequestFailure(fetchError)) {
          console.warn('🌐 Reverse geocoding network unavailable - using fallback');
        } else {
          throw fetchError;
        }
      }
    } catch (error) {
      if (isNetworkRequestFailure(error)) {
        console.warn('🌐 Reverse geocoding request blocked or offline - using fallback');
      } else {
        console.error('❌ Reverse geocoding error:', error);
      }
    }

    setLocationName(fallbackLabel);
    addToRecent(fallbackLabel, coords[1], coords[0]);
  }, [addToRecent]);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      return;
    }

    Keyboard.dismiss();

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(searchQuery)}&countrycodes=ph&bounded=1&viewbox=116,22,127,4&limit=3&addressdetails=1&accept-language=en`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'AlertoApp/1.0',
          'Accept-Language': 'en',
        },
      });
      const data = await response.json();

      const philippinesResults = Array.isArray(data) ? data.filter(isPhilippinesSearchResult) : [];

      if (philippinesResults.length > 0) {
        const { lat, lon, display_name } = philippinesResults[0];
        const newCoords: [number, number] = [parseFloat(lon), parseFloat(lat)];
        const resolvedLabel = formatSearchResultLabel(display_name, searchQuery.trim()) || searchQuery.trim();

        setRegion(newCoords);
        setLocationName(resolvedLabel);
        setSearchQuery(resolvedLabel);
        setSuggestions([]);
        addToRecent(resolvedLabel, parseFloat(lat), parseFloat(lon));
      } else {
        Alert.alert("Location Not Found", "Please search for a place within the Philippines.");
      }
    } catch (error) {
      if (isNetworkRequestFailure(error)) {
        console.warn('🌐 Search request blocked or offline');
        Alert.alert("Search Unavailable", "This network is blocking online place search. You can still pin a location on the map.");
      } else {
        console.error('Search error:', error);
        Alert.alert("Error", "Unable to search for that location right now.");
      }
    }
  }, [addToRecent, searchQuery]);

  const fetchSuggestions = useCallback(async (query: string) => {
    if (!query.trim() || query.length < 2) {
      setSuggestions([]);
      return;
    }

    try {
      //Photon API
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=8&lon=${region[0]}&lat=${region[1]}&location_bias_scale=0.5`;
      const response = await fetch(url);
      const data = await response.json();

      if (data && data.features) {
        const fetchedSuggestions: Suggestion[] = data.features.filter((f: any) => {
          return (
            isPhilippinesSearchResult(f) &&
            (!f.properties.country || f.properties.country === 'Philippines')
          );
        }).slice(0, 5).map((f: any) => {
          const displayName = [
            f.properties.name,
            f.properties.street,
            f.properties.district,
            f.properties.city,
            f.properties.state,
            f.properties.country === 'Philippines' ? '' : f.properties.country
          ].filter(Boolean).join(', ');

          return {
            id: f.properties.osm_id?.toString() || Math.random().toString(),
            name: formatSearchResultLabel(displayName, f.properties.name || f.properties.city || "Unknown Location") || "Unknown Location",
            lat: f.geometry.coordinates[1],
            lng: f.geometry.coordinates[0],
            displayName,
          };
        });
        setSuggestions(fetchedSuggestions);
      }
    } catch (error) {
      if (!isNetworkRequestFailure(error)) {
        console.log("Suggestions fetch error:", error);
      }
      setSuggestions([]);
    }
  }, [region]);

  const handleLocateMe = useCallback(async () => {
    try {
      const allowLocationPref = await AsyncStorage.getItem('alerto_allow_location');
      if (allowLocationPref === 'false') {
        setLocationName("Location Disabled");
        setIsLocationModalVisible(true);
        return;
      }
    } catch (e) {
      console.error("Error reading location preference:", e);
    }

    const { status } = await Location.getForegroundPermissionsAsync();

    if (status !== 'granted') {
      setIsLocationModalVisible(true);
      return;
    }

    try {
      const lastKnown = await Location.getLastKnownPositionAsync();
      if (lastKnown) {
        const coords: [number, number] = [lastKnown.coords.longitude, lastKnown.coords.latitude];

        //to avoid default emulator HQ
        const isDefaultHQ = Math.abs(coords[0] - (-122.084)) < 0.1 && Math.abs(coords[1] - 37.422) < 0.1;

        if (!isDefaultHQ && isWithinPhilippinesBounds(coords)) {
          setRegion(coords);
          setCurrentCoords(coords);
          void reverseGeocode(coords);
        }
      }

      const positionPromise = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000));
      const location = await Promise.race([positionPromise, timeoutPromise]) as Location.LocationObject;

      const newCoords: [number, number] = [location.coords.longitude, location.coords.latitude];

      const isDefaultHQ = Math.abs(newCoords[0] - (-122.084)) < 0.1 && Math.abs(newCoords[1] - 37.422) < 0.1;

      if (!isDefaultHQ && isWithinPhilippinesBounds(newCoords)) {
        setRegion(newCoords);
        setCurrentCoords(newCoords);
        void reverseGeocode(newCoords);
        checkLocationProximity(newCoords[0], newCoords[1]);
      } else if (!isDefaultHQ) {
        Alert.alert(
          "Outside Philippines",
          "Alerto map selection is limited to the Philippines."
        );
      } else {
        Alert.alert(
          "Emulator Location Detected",
          "You are using the default emulator location (Google HQ). Please change your emulator's location to the Philippines to test this feature."
        );
      }
    } catch (error) {
      console.log("GPS Timeout or Error, using fallback.", error);
      Alert.alert(
        "Location Error",
        "Could not detect your current location. Please ensure your device GPS is turned on and try again."
      );
    }
  }, [reverseGeocode]);

  const checkLocationProximity = useCallback((lng: number, lat: number) => {
    if (!isWithinPhilippinesBounds([lng, lat])) {
      return;
    }

    const now = Date.now();
    const latestCoords = { lat, lng };
    tripSessionRef.current.lastLocationUpdateAt = now;

    const hasMoved = (
      !tripSessionRef.current.lastKnownCoords ||
      calculateDistance(
        lat,
        lng,
        tripSessionRef.current.lastKnownCoords.lat,
        tripSessionRef.current.lastKnownCoords.lng
      ) >= DEFAULT_BEHAVIOR_THRESHOLDS.minMovementMeters
    );

    if (hasMoved) {
      tripSessionRef.current.lastMovedAt = now;

      // Auto-end driver stop when vehicle resumes movement
      if (isDriverStopActive) {
        endDriverStop();
      }
    }

    tripSessionRef.current.lastKnownCoords = latestCoords;

    //for check hazards
    if (hazardPoints && hazardPoints.length > 0) {
      for (const hazard of hazardPoints) {
        const distance = calculateDistance(lat, lng, hazard.lat, hazard.lng);
        if (distance <= 500) { // threshold
          if (!notifiedHazardsRef.current.has(hazard.id)) {
            notifiedHazardsRef.current.add(hazard.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            sendLocalNotification(
              'Danger Ahead',
              `You are approaching a high-risk area: ${hazard.type || hazard.category}`
            );

            if (isAlarmActive) {
              tripSessionRef.current.alertsCount += 1;
              tripSessionRef.current.unsafeZones.add(hazard.type || hazard.category || 'Unknown');
            }
          }
        } else {
          if (notifiedHazardsRef.current.has(hazard.id)) {
            notifiedHazardsRef.current.delete(hazard.id);
          }
        }
      }
    }

    //for check of destination trigger zone and actual arrival
    if (isAlarmActive && destinationCoords) {
      const distanceToDest = calculateDistance(lat, lng, destinationCoords.lat, destinationCoords.lng);

      if (!notifiedArrivalRef.current && distanceToDest <= ARRIVAL_RADIUS_METERS) {
        notifiedArrivalRef.current = true;
        tripSessionRef.current.safetyStatus = 'Arrived';
        tripSessionRef.current.safetyCheckDeadlineAt = null;
        setSafetyStatus('Arrived');
        setSafetyCheckDeadlineAt(null);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        sendLocalNotification(
          'Arrived!',
          `You have reached your destination: ${activeAlarmDestination}`
        );

        tripSessionRef.current.currentResponseStartTime = Date.now();
        if (!notifiedTriggerZoneRef.current) {
          notifiedTriggerZoneRef.current = true;
          void sendDestinationAlert();
        }
      } else if (
        activeAlarmThresholdMeters !== null &&
        !notifiedTriggerZoneRef.current &&
        distanceToDest <= activeAlarmThresholdMeters
      ) {
        notifiedTriggerZoneRef.current = true;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        sendLocalNotification(
          'Wake-up Alert',
          `You are within ${Math.round(activeAlarmThresholdMeters)} meters of ${activeAlarmDestination}.`
        );
        void sendDestinationAlert();
      }
    }

    if (isAlarmActive) {
      processBehaviorMonitoring(now);
    }
  }, [isAlarmActive, destinationCoords, hazardPoints, activeAlarmDestination, activeAlarmThresholdMeters, refreshRoutePlan, processBehaviorMonitoring, isDriverStopActive, endDriverStop, sendDestinationAlert]);

  useEffect(() => {
    void handleLocateMe();
    void requestNotificationPermissions();

    Promise.all([fetchHazards(), fetchRiskHeatmap()])
      .then(([hazards, riskPoints]) => {
        setHazardPoints(hazards);
        setRiskHeatmapPoints(riskPoints);
      })
      .catch(error => {
        console.error('Failed to load map hazard data:', error);
      });
  }, [handleLocateMe]);

  useEffect(() => {
    let locationSub: Location.LocationSubscription;

    const startWatching = async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'granted') {
        locationSub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            distanceInterval: 10, //update every 10 meters
          },
          (loc) => {
            if (!isWithinPhilippinesBounds([loc.coords.longitude, loc.coords.latitude])) {
              return;
            }

            setCurrentCoords([loc.coords.longitude, loc.coords.latitude]);
            checkLocationProximity(loc.coords.longitude, loc.coords.latitude);
          }
        );
      }
    };

    void startWatching();

    return () => {
      if (locationSub) {
        locationSub.remove();
      }
    };
  }, [checkLocationProximity]);

  useEffect(() => {
    if (!isAlarmActive) {
      return;
    }

    const interval = setInterval(() => {
      processBehaviorMonitoring();

      if (
        tripSessionRef.current.safetyCheckDeadlineAt &&
        Date.now() >= tripSessionRef.current.safetyCheckDeadlineAt &&
        !tripSessionRef.current.sosTriggeredAt
      ) {
        const latestReason =
          tripSessionRef.current.anomalyReasonLog[tripSessionRef.current.anomalyReasonLog.length - 1] ||
          'Unverified suspicious behavior';
        void triggerAutomaticSos(latestReason);
      }
    }, 1_000);

    return () => clearInterval(interval);
  }, [isAlarmActive, processBehaviorMonitoring, triggerAutomaticSos]);

  // Commute heartbeat: signal active status to the web dashboard every 10s
  useEffect(() => {
    if (!isAlarmActive || !user?.id) {
      return;
    }

    const sendHeartbeat = () => {
      const lat = tripSessionRef.current.lastKnownCoords?.lat;
      const lng = tripSessionRef.current.lastKnownCoords?.lng;
      const status = tripSessionRef.current.safetyStatus;
      const triggers = Array.from(tripSessionRef.current.anomalyTriggers);
      const startTime = tripSessionRef.current.startTime;

      sendCommuteHeartbeat(user.id, true, status, lat, lng, triggers, startTime);
    };

    // Send immediate heartbeat when commute starts
    sendHeartbeat();

    const heartbeatInterval = setInterval(sendHeartbeat, 10_000);

    return () => {
      clearInterval(heartbeatInterval);
      // Send inactive heartbeat when commute stops
      if (user?.id) {
        sendCommuteHeartbeat(user.id, false);
      }
    };
  }, [isAlarmActive, user?.id]);


  const clearRecentSearches = useCallback(() => {
    setRecentSearches(prev => {
      return prev.filter(item => favorites.includes(item.name));
    });
  }, [favorites]);

  //for loading data
  useEffect(() => {
    isPersistedDataLoadedRef.current = false;
    const loadPersistedData = async () => {
      if (!user) {
        setRecentSearches([]);
        setFavorites([]);
        isPersistedDataLoadedRef.current = true;
        return;
      }
      try {
        const userRecentsKey = `alerto_recents_${user.id}`;
        const userFavoritesKey = `alerto_favorites_${user.id}`;

        let loadedRecents: RecentSearch[] = [];
        let loadedFavorites: string[] = [];

        const savedSearches = await AsyncStorage.getItem(userRecentsKey);
        if (savedSearches) {
          loadedRecents = JSON.parse(savedSearches);
        } else {
          // Check legacy unscoped key
          const legacy = await AsyncStorage.getItem('alerto_recent_searches');
          if (legacy) {
            loadedRecents = JSON.parse(legacy);
            await AsyncStorage.setItem(userRecentsKey, legacy);
          }
        }

        const savedFavorites = await AsyncStorage.getItem(userFavoritesKey);
        if (savedFavorites) {
          loadedFavorites = JSON.parse(savedFavorites);
        } else {
          // Check legacy unscoped key
          const legacy = await AsyncStorage.getItem('alerto_favorites');
          if (legacy) {
            loadedFavorites = JSON.parse(legacy);
            await AsyncStorage.setItem(userFavoritesKey, legacy);
          }
        }

        setRecentSearches(loadedRecents);
        setFavorites(loadedFavorites);
        isPersistedDataLoadedRef.current = true;
      } catch (e) {
        console.error("Error loading local data", e);
        isPersistedDataLoadedRef.current = true;
      }
    };
    loadPersistedData();
  }, [user]);

  //for saving
  useEffect(() => {
    const savePersistedData = async () => {
      if (!user || !isPersistedDataLoadedRef.current) return;
      try {
        await AsyncStorage.setItem(`alerto_recents_${user.id}`, JSON.stringify(recentSearches));
        await AsyncStorage.setItem(`alerto_favorites_${user.id}`, JSON.stringify(favorites));
      } catch (e) {
        console.error("Error saving local data", e);
      }
    };
    savePersistedData();
  }, [recentSearches, favorites, user]);

  const handleAllowLocationMap = async () => {
    setIsLocationModalVisible(false);
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus === 'granted') {
      await Location.requestBackgroundPermissionsAsync();
      await AsyncStorage.setItem('alerto_allow_location', 'true');
      await handleLocateMe();
    } else {
      Alert.alert(
        "Permission Denied",
        "Location access is turned off in your device settings. Would you like to open Settings?",
        [
          { text: "Not Now", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings() }
        ]
      );
    }
  };

  const confirmSafety = () => {
    tripSessionRef.current.safetyStatus = 'Normal';
    tripSessionRef.current.safetyCheckDeadlineAt = null;
    tripSessionRef.current.activeSafetyTriggerKey = null;
    tripSessionRef.current.lastMovedAt = Date.now();
    tripSessionRef.current.lastLocationUpdateAt = Date.now();
    setSafetyStatus('Normal');
    setAnomalyTriggers([]);
    setSafetyCheckDeadlineAt(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    sendLocalNotification(
      'Safety Confirmed',
      'Trip monitoring will continue normally.'
    );
  };
 
  const simulateAnomaly = useCallback((type: 'OFF_ROUTE' | 'IDLE_TIME') => {
    if (!isAlarmActive) {
      return;
    }

    tripSessionRef.current.safetyStatus = 'Suspicious';
    tripSessionRef.current.suspiciousAt = Date.now();
    tripSessionRef.current.safetyCheckDeadlineAt = Date.now() + 15 * 1000;
    setSafetyStatus('Suspicious');
    setAnomalyTriggers([type]);
    setSafetyCheckDeadlineAt(Date.now() + 15 * 1000);
  }, [isAlarmActive]);

  const startAlarm = useCallback(async (
    destinationName: string,
    lat: number,
    lng: number,
    thresholdMeters: number,
    preferences?: AlarmPreferenceInput
  ) => {
    if (!isWithinPhilippinesBounds([lng, lat])) {
      Alert.alert('Philippines Only', 'Commute monitoring can only use destinations within the Philippines.');
      return;
    }

    try {
      console.log('🚨 Starting alarm with settings:', { destinationName, lat, lng, thresholdMeters, preferences });

      // Initialize trip session
      tripSessionRef.current.startTime = Date.now();
      tripSessionRef.current.startCoords = currentCoords
        ? { lat: currentCoords[1], lng: currentCoords[0] }
        : { lat, lng };
      tripSessionRef.current.alertsCount = 0;
      tripSessionRef.current.unsafeZones.clear();
      tripSessionRef.current.responseTimes = [];
      tripSessionRef.current.anomalyCount = 0;
      tripSessionRef.current.anomalyTriggers.clear();
      tripSessionRef.current.anomalyReasonLog = [];
      tripSessionRef.current.safetyStatus = 'Normal';
      tripSessionRef.current.suspiciousAt = null;
      tripSessionRef.current.sosTriggeredAt = null;
      tripSessionRef.current.activeSafetyTriggerKey = null;
      tripSessionRef.current.routeRefreshCount = 0;
      tripSessionRef.current.lastMovedAt = Date.now();
      tripSessionRef.current.lastLocationUpdateAt = Date.now();

      // Reset notification tracking
      notifiedHazardsRef.current.clear();
      notifiedArrivalRef.current = false;
      notifiedTriggerZoneRef.current = false;
      routeRefreshRef.current = { at: 0, coords: null };

      // Update state
      setIsAlarmActive(true);
      setActiveAlarmDestination(destinationName);
      setActiveAlarmThresholdMeters(thresholdMeters);
      setDestinationCoords({ lat, lng });
      setSafetyStatus('Normal');
      setAnomalyTriggers([]);
      setSafetyCheckDeadlineAt(null);

      // Refresh route plan
      await refreshRoutePlan({ lat, lng });

      const alarmConfig = buildBagAlarmSettings({
        lat,
        lng,
        thresholdMeters,
        intensity: preferences?.intensity,
        durationSeconds: preferences?.durationSeconds,
      });

      console.log('📤 Sending alarm config:', JSON.stringify(alarmConfig));

      try {
        const result = await sendSettings(alarmConfig);
        console.log('✅ Alarm config synced to hardware:', result);
      } catch (bleError) {
        console.error('⚠️ BLE sync warning (continuing anyway):', bleError);
        // Don't fail - continue even if BLE sync fails
      }
    } catch (error) {
      console.error('❌ Error starting alarm:', error);
      Alert.alert('Error', 'Failed to start alarm: ' + (error instanceof Error ? error.message : 'Unknown error'));
      setIsAlarmActive(false);
    }
  }, [currentCoords, sendSettings, refreshRoutePlan]);

  const stopAlarm = () => {
    void sendDestinationStop();

    if (isAlarmActive && tripSessionRef.current.startTime > 0) {
      const duration = Date.now() - tripSessionRef.current.startTime;

      if (tripSessionRef.current.currentResponseStartTime) {
        tripSessionRef.current.responseTimes.push(Date.now() - tripSessionRef.current.currentResponseStartTime);
      }

      addTrip({
        id: Date.now().toString(),
        date: tripSessionRef.current.startTime,
        destinationName: activeAlarmDestination,
        durationMs: duration,
        alertsTriggeredCount: tripSessionRef.current.alertsCount,
        responseTimes: [...tripSessionRef.current.responseTimes],
        unsafeZonesEncountered: Array.from(tripSessionRef.current.unsafeZones),
        safetyStatus: notifiedArrivalRef.current ? 'Arrived' : tripSessionRef.current.safetyStatus,
        anomalyCount: tripSessionRef.current.anomalyCount,
        anomalyTriggers: Array.from(tripSessionRef.current.anomalyTriggers),
        suspiciousAt: tripSessionRef.current.suspiciousAt,
        sosTriggeredAt: tripSessionRef.current.sosTriggeredAt,
        lastKnownLat: tripSessionRef.current.lastKnownCoords?.lat ?? null,
        lastKnownLng: tripSessionRef.current.lastKnownCoords?.lng ?? null,
        routeRecognitionStatus: tripSessionRef.current.routeRecognitionStatus,
        routeRefreshCount: tripSessionRef.current.routeRefreshCount,
      });
    }

    setIsAlarmActive(false);
    setActiveAlarmDestination('');
    setActiveAlarmThresholdMeters(null);
    setDestinationCoords(null);
    setActiveRoute(null);
    routeRefreshRef.current = { at: 0, coords: null };
    notifiedArrivalRef.current = false;
    notifiedTriggerZoneRef.current = false;
    setMonitoringMetrics(null);
    setSafetyCheckDeadlineAt(null);
    setAnomalyTriggers([]);
    setSafetyStatus('Cancelled');
    // Reset driver stop
    setIsDriverStopActive(false);
    setDriverStopReason(null);
    setDriverStopType(null);
    setDriverStopSnoozeUntil(null);
    driverStopAutoDetectedRef.current = false;
  };

  return (
    <MapContext.Provider value={{
      region, currentCoords, zoomLevel, locationName, recentSearches, searchQuery, favorites, suggestions,
      setRegion, setZoomLevel, setLocationName, setSearchQuery, setRecentSearches, setSuggestions,
      reverseGeocode, handleSearch, handleLocateMe, toggleFavorite, addToRecent, clearRecentSearches, fetchSuggestions,
      isAlarmActive, activeAlarmDestination, activeAlarmThresholdMeters, startAlarm, stopAlarm, confirmSafety, hazardPoints, riskHeatmapPoints,
      activeRoute, refreshRoutePlan,
      routeRecognitionStatus, routeRefreshCount,
      safetyStatus, anomalyTriggers, monitoringMetrics, safetyCheckDeadlineAt,
      triggerEmergency: triggerAutomaticSos,
      isDriverStopActive, driverStopReason, driverStopType, driverStopSnoozeUntil,
      startDriverStop, endDriverStop,
      simulateAnomaly
    }}>
      {children}
      <LocationPermissionModal
        visible={isLocationModalVisible}
        onAllow={handleAllowLocationMap}
        onDeny={() => setIsLocationModalVisible(false)}
      />
    </MapContext.Provider>
  );
}

export const useMapContext = () => {
  const context = useContext(MapContext);
  if (!context) throw new Error("useMapContext must be used within a MapProvider");
  return context;
};
