import { DestinationCard } from '@/components/alerts/destination-card';
import { DriverStopModal } from '@/components/alerts/driver-stop-modal';
import { ProgressBar } from '@/components/alerts/progress-bar';
import { StatusCard } from '@/components/alerts/status-card';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/color';
import { useAntiTheftBle } from '@/context/anti-theft-ble-context';
import { DriverStopType, useMapContext } from '@/context/map-context';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { sendLocalNotification } from '@/utils/notifications';
import MapLibreGL from '@maplibre/maplibre-react-native';

const _STADIA_KEY = process.env.EXPO_PUBLIC_STADIA_API_KEY;
const BASE_MAP_URL_CM = _STADIA_KEY
  ? `https://tiles.stadiamaps.com/styles/osm_bright.json?api_key=${_STADIA_KEY}`
  : 'https://tiles.stadiamaps.com/styles/osm_bright.json';
const DARK_MAP_URL_CM = _STADIA_KEY
  ? `https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json?api_key=${_STADIA_KEY}`
  : 'https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json';

function buildLineShape(points: { lat: number; lng: number }[]) {
  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'LineString' as const,
          coordinates: points.map(point => [point.lng, point.lat]),
        },
      },
    ],
  };
}

export default function DriverMonitorScreen() {
  const router = useRouter();
  const theme = useColorScheme() ?? 'light';
  const colors = Colors[theme as 'light' | 'dark'];
  
  const { connectionStatus, armSystem, disarmSystem, enableReed, enableLdr, enableMpu } = useAntiTheftBle();
  
  const { 
    isAlarmActive,
    activeAlarmDestination,
    activeAlarmThresholdMeters,
    locationName,
    region,
    currentCoords,
    activeRoute,
    safetyStatus,
    monitoringMetrics,
    isDriverStopActive,
    driverStopReason,
    driverStopSnoozeUntil,
    startDriverStop,
    endDriverStop,
  } = useMapContext();

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [driverStopCountdown, setDriverStopCountdown] = useState<string | null>(null);
  
  // Track previous state to trigger hardware changes only on transition
  const previousStopActive = useRef(isDriverStopActive);

  // Auto-arm on arrival
  useEffect(() => {
    if (safetyStatus === 'Arrived') {
        armSystem(enableReed, enableLdr, enableMpu);
        sendLocalNotification('Destination Reached', 'Anti-theft bag has been automatically armed.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [safetyStatus, armSystem, enableReed, enableLdr, enableMpu]);

  // Auto-disarm/arm hardware based on the global stop state (which handles auto-detection)
  useEffect(() => {
    if (isDriverStopActive && !previousStopActive.current) {
      // Just became active
      disarmSystem();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      sendLocalNotification('Bag Alarm Paused', 'Anti-theft sensors temporarily disabled.');
    } else if (!isDriverStopActive && previousStopActive.current) {
      // Just became inactive
      armSystem(enableReed, enableLdr, enableMpu);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      sendLocalNotification('Bag Alarm Active', 'Anti-theft monitoring has resumed.');
    }
    previousStopActive.current = isDriverStopActive;
  }, [isDriverStopActive, disarmSystem, armSystem, enableReed, enableLdr, enableMpu]);

  // Countdown timer for snooze
  useEffect(() => {
    if (!isDriverStopActive || !driverStopSnoozeUntil) {
      setDriverStopCountdown(null);
      return;
    }

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((driverStopSnoozeUntil - Date.now()) / 1000));
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      setDriverStopCountdown(mins > 0 ? `${mins}m ${secs}s` : `${secs}s`);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isDriverStopActive, driverStopSnoozeUntil]);

  const handleStartStop = (reason: string, stopType: DriverStopType, durationMinutes: number) => {
    startDriverStop(reason, stopType, durationMinutes);
    setIsModalVisible(false);
  };

  const isConnected = connectionStatus === 'connected' || connectionStatus === 'armed';

  // Map and Tracking Data
  const mapStyle = theme === 'dark' ? DARK_MAP_URL_CM : BASE_MAP_URL_CM;
  const routeShape = activeRoute?.points?.length ? buildLineShape(activeRoute.points) : null;
  const trafficShapes = activeRoute?.trafficSegments
    ?.filter(segment => segment.points.length >= 2)
    .map(segment => ({
      id: segment.id,
      color:
        segment.severity === 'heavy'
          ? '#dc2626'
          : segment.severity === 'moderate'
            ? '#f97316'
            : '#eab308',
      shape: buildLineShape(segment.points),
    })) ?? [];

  const displayDestination = isAlarmActive 
      ? (activeAlarmDestination || locationName || 'Unknown Destination')
      : '';
  const mapCenter = currentCoords ?? region;
  const activeAlarmThresholdKm = activeAlarmThresholdMeters !== null ? activeAlarmThresholdMeters / 1000 : null;
  const remainingDistanceMeters = monitoringMetrics?.distanceToDestinationMeters ?? null;
  const remainingDistanceKm = remainingDistanceMeters !== null ? remainingDistanceMeters / 1000 : null;
  const triggerDistanceKm = (
    remainingDistanceKm !== null &&
    activeAlarmThresholdKm !== null
  ) ? Math.max(0, remainingDistanceKm - activeAlarmThresholdKm) : null;
  const progress = (
    remainingDistanceKm !== null &&
    activeAlarmThresholdKm !== null &&
    remainingDistanceKm > 0
  ) ? Math.min(1, activeAlarmThresholdKm / remainingDistanceKm) : 0;

  const destinationData = {
    eta: safetyStatus === 'Arrived'
      ? 'Arrived'
      : activeRoute
          ? `${Math.max(1, Math.round(activeRoute.travelTimeSeconds / 60))} mins`
          : '--'
  };
  const distanceData = {
    remaining: remainingDistanceKm !== null ? remainingDistanceKm.toFixed(2) : '--',
    unit: "km",
    triggerZone: activeAlarmThresholdKm !== null ? `${activeAlarmThresholdKm.toFixed(2)} km` : '--',
    triggerDistance: triggerDistanceKm !== null ? `${triggerDistanceKm.toFixed(2)} km` : '--',
    progress,
    triggerRatio: 0.75
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <IconSymbol name="chevron.left" size={24} color={colors.mainText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.mainText }]}>Driver Monitor</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Active Driver Stop Banner */}
        {isDriverStopActive && (
          <View style={[styles.driverStopBanner, { backgroundColor: theme === 'dark' ? '#1a3a2a' : '#d1f4e0', borderColor: theme === 'dark' ? '#2d6a4f' : '#95d5b2' }]}>
            <View style={styles.driverStopBannerContent}>
              <View style={[styles.driverStopIconBox, { backgroundColor: theme === 'dark' ? '#2d6a4f' : '#95d5b2' }]}>
                <IconSymbol name="pause-circle" size={24} color={theme === 'dark' ? '#95d5b2' : '#1b4332'} />
              </View>
              <View style={styles.driverStopTextArea}>
                <Text style={[styles.driverStopTitle, { color: theme === 'dark' ? '#95d5b2' : '#1b4332' }]}>
                  Bag Sensors Paused
                </Text>
                <Text style={[styles.driverStopReasonText, { color: theme === 'dark' ? '#b7e4c7' : '#2d6a4f' }]} numberOfLines={1}>
                  {driverStopReason || 'Driver stop detected'}
                </Text>
                {driverStopCountdown && (
                  <Text style={[styles.driverStopTimer, { color: theme === 'dark' ? '#74c69d' : '#40916c' }]}>
                    Auto-resume in {driverStopCountdown}
                  </Text>
                )}
              </View>
            </View>
            <TouchableOpacity
              style={[styles.driverStopResumeBtn, { backgroundColor: theme === 'dark' ? '#2d6a4f' : '#40916c' }]}
              onPress={endDriverStop}
              activeOpacity={0.8}
            >
              <Text style={styles.driverStopResumeBtnText}>Resume</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={[styles.statusSection, { backgroundColor: colors.configColor, borderColor: colors.hr }]}>
          <StatusCard>
            <View style={styles.cardLeft}>
              <View style={[styles.iconBox, { backgroundColor: colors.primaryIcon }]}>
                <IconSymbol name="satellite-variant" size={20} color={colors.background} />
              </View>
              <Text style={[styles.statusTitle, { color: colors.mainText }]}>
                GPS
              </Text>
            </View>
            <Text style={[styles.statusValue, { color: colors.lightning }]}>
              Active
            </Text>
          </StatusCard>

          <View style={[styles.divider, { backgroundColor: colors.hr }]} />

          <StatusCard>
            <View style={styles.cardLeft}>
              <View style={[styles.iconBox, { backgroundColor: colors.primaryIcon }]}>
                <IconSymbol name="shield-alert" size={20} color={colors.background} />
              </View>
              <Text style={[styles.statusTitle, { color: colors.mainText }]}>
                Bag State
              </Text>
            </View>
            <Text style={[styles.statusValue, { color: isConnected ? (isDriverStopActive ? colors.warningIcon : colors.primaryIcon) : colors.locationMarker }]}>
              {!isConnected ? 'Disconnected' : (isDriverStopActive ? 'Snoozed' : 'Armed')}
            </Text>
          </StatusCard>
        </View>

        <View style={[styles.mapContainer, { backgroundColor: colors.avatarBorder }]}>
          <MapLibreGL.MapView 
            style={StyleSheet.absoluteFillObject}
            mapStyle={mapStyle}
            logoEnabled={false}
            attributionEnabled={false}
            surfaceView={Platform.OS === 'android'}
            scrollEnabled={false}
            pitchEnabled={false}
            rotateEnabled={false}
            zoomEnabled={false}
          >
            <MapLibreGL.Camera
              zoomLevel={15}
              centerCoordinate={mapCenter}
              animationMode="flyTo"
            />

            {routeShape && (
              <MapLibreGL.ShapeSource id="activeRouteSource" shape={routeShape}>
                <MapLibreGL.LineLayer
                  id="activeRouteLine"
                  style={{
                    lineColor: theme === 'dark' ? '#3b82f6' : colors.primaryIcon,
                    lineWidth: 5,
                    lineOpacity: 0.9,
                  }}
                />
              </MapLibreGL.ShapeSource>
            )}

            {trafficShapes.map(segment => (
              <MapLibreGL.ShapeSource key={segment.id} id={segment.id} shape={segment.shape}>
                <MapLibreGL.LineLayer
                  id={`${segment.id}-line`}
                  style={{
                    lineColor: segment.color,
                    lineWidth: 7,
                    lineOpacity: 0.92,
                  }}
                />
              </MapLibreGL.ShapeSource>
            ))}
            
            {isAlarmActive && (
              <MapLibreGL.PointAnnotation 
                id="alert-marker" 
                coordinate={mapCenter} 
                anchor={{ x: 0.5, y: 1 }}
              >
                <View style={styles.markerContainer} collapsable={false}>
                  <IconSymbol name="location-sharp" size={40} color={colors.locationMarker} />
                </View>
              </MapLibreGL.PointAnnotation>
            )}
          </MapLibreGL.MapView>

          <View style={[styles.mapLegend, { backgroundColor: colors.background }]}>
            <Text style={[styles.mapLegendTitle, { color: colors.text }]}>Driver Tracking</Text>
            <Text style={[styles.mapLegendBody, { color: colors.subtitle }]}>
              Bag alarm will automatically arm when destination is reached.
            </Text>
          </View>
          
          <DestinationCard>
            <View style={styles.destRow}>
               <Text style={[styles.destLabel, { color: colors.subtitle }]}>DESTINATION</Text>
               <Text style={[styles.destLabel, { color: colors.subtitle }]}>ETA</Text>
            </View>
            <View style={styles.destRowBottom}>
               {isAlarmActive ? (
                 <Text style={[styles.destValue, { color: colors.primaryIcon }]} numberOfLines={1}>{displayDestination}</Text>
               ) : (
                  <Text style={[styles.destInput, { color: colors.subtitle }]}>
                    Input place name
                  </Text>
               )}
               <Text style={[styles.etaValue, { color: colors.lightning }]}>{isAlarmActive ? destinationData.eta : '--'}</Text>
            </View>
          </DestinationCard>
        </View>

        <View style={styles.distanceSection}>
            <Text style={[styles.distanceLabel, { color: colors.mainText }]}>
              DISTANCE REMAINING
            </Text>
           <View style={styles.distanceRow}>
             <Text style={[styles.distanceBig, { color: colors.avatarBg }]}>{isAlarmActive ? distanceData.remaining : '--'}</Text>
              <Text style={[styles.distanceUnit, { color: colors.avatarBg }]}>
                {distanceData.unit}
              </Text>
           </View>

           <View style={styles.progressWrapper}>
             <View style={styles.progressLabels}>
                <Text style={[styles.progressLabelLeft, { color: colors.primaryIcon }]}>
                  Current
                </Text>
                <Text style={[styles.progressLabelRight, { color: colors.lightning }]}>
                  Arrival Zone ({distanceData.triggerZone})
                </Text>
             </View>
             
             <ProgressBar progress={isAlarmActive ? distanceData.progress : 0} triggerRatio={distanceData.triggerRatio} />
             
             <Text style={[styles.progressSubText, { color: colors.mainText }]}>
                {safetyStatus === 'Arrived'
                  ? 'Bag successfully armed.'
                  : triggerDistanceKm !== null && triggerDistanceKm > 0
                    ? `Bag arms in ${distanceData.triggerDistance}`
                    : 'Within arrival zone'}
              </Text>
           </View>
        </View>

        {isAlarmActive && !isDriverStopActive ? (
            <TouchableOpacity
                style={[styles.reportStopButton, { backgroundColor: colors.configColor, borderColor: colors.hr }]}
                onPress={() => setIsModalVisible(true)}
                activeOpacity={0.8}
            >
                <IconSymbol name="pause-circle" size={20} color={colors.primaryIcon} style={{ marginRight: 8 }} />
                <Text style={[styles.reportStopText, { color: colors.primaryIcon }]}>
                Report a Stop
                </Text>
            </TouchableOpacity>
        ) : !isAlarmActive ? (
            <View style={[styles.reportStopButton, { backgroundColor: colors.hr, shadowOpacity: 0, elevation: 0 }]}>
                <Text style={[styles.reportStopText, { color: colors.subtitle }]}>
                No Active Trip
                </Text>
            </View>
        ) : null}

      </ScrollView>

      <DriverStopModal
        visible={isModalVisible}
        onClose={() => setIsModalVisible(false)}
        onConfirm={handleStartStop}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  scrollContent: { padding: 20, paddingBottom: 40 },
  driverStopBanner: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  driverStopBannerContent: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  driverStopIconBox: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  driverStopTextArea: { flex: 1, marginLeft: 12 },
  driverStopTitle: { fontSize: 18, fontWeight: '800', marginBottom: 2 },
  driverStopReasonText: { fontSize: 14, fontWeight: '500' },
  driverStopTimer: { fontSize: 14, fontWeight: '700', marginTop: 4 },
  driverStopResumeBtn: { paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  driverStopResumeBtnText: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },
  statusSection: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center' },
  iconBox: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  statusTitle: { fontSize: 15, fontWeight: '600' },
  statusValue: { fontSize: 15, fontWeight: '700' },
  divider: { width: 1, height: '80%', marginHorizontal: 16 },
  mapContainer: {
    height: 380,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 5,
  },
  markerContainer: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  mapLegend: { position: 'absolute', top: 12, left: 12, padding: 12, borderRadius: 12, width: 220 },
  mapLegendTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  mapLegendBody: { fontSize: 12, lineHeight: 16 },
  destRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  destLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  destRowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  destValue: { fontSize: 16, fontWeight: '700', flex: 1, paddingRight: 10 },
  destInput: { fontSize: 16, fontWeight: '500', fontStyle: 'italic' },
  etaValue: { fontSize: 20, fontWeight: '800' },
  distanceSection: { paddingHorizontal: 4, marginBottom: 24 },
  distanceLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  distanceRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 16 },
  distanceBig: { fontSize: 48, fontWeight: '800', letterSpacing: -1 },
  distanceUnit: { fontSize: 20, fontWeight: '600', marginLeft: 8 },
  progressWrapper: { marginTop: 4 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressLabelLeft: { fontSize: 12, fontWeight: '600' },
  progressLabelRight: { fontSize: 12, fontWeight: '700' },
  progressSubText: { fontSize: 13, marginTop: 10, textAlign: 'center', fontStyle: 'italic' },
  reportStopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  reportStopText: { fontSize: 16, fontWeight: '700' },
});
