import { DestinationCard } from '@/components/alerts/destination-card';
import { ProgressBar } from '@/components/alerts/progress-bar';
import { StatusCard } from '@/components/alerts/status-card';
import { StopAlarmModal } from '@/components/alerts/stop-alarm-modal';
import { ArrivalAlertModal } from '@/components/alerts/arrival-alert-modal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/color';
import { useBleContext } from '@/context/ble-context';
import { useMapContext } from '@/context/map-context';
import MapLibreGL from '@maplibre/maplibre-react-native';
import React, { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

MapLibreGL.setAccessToken(null);

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

import { useRouter } from 'expo-router';

export default function CommuteMonitorScreen() {
  const router = useRouter();
  const {
    isAlarmActive,
    activeAlarmDestination,
    activeAlarmThresholdMeters,
    stopAlarm,
    confirmSafety,
    locationName,
    region,
    currentCoords,
    activeRoute,
    safetyStatus,
    monitoringMetrics,
    safetyCheckDeadlineAt,
  } = useMapContext();
  const { connectedDevice, sensorData, sendStopCommand } = useBleContext();
  
  const [isModalVisible, setIsModalVisible] = useState(false);
  const theme = useColorScheme() ?? 'light';
  const colors = Colors[theme as 'light' | 'dark'];
  const mapStyle = theme === 'dark' 
      ? `https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json?api_key=${process.env.EXPO_PUBLIC_STADIA_API_KEY}`
      : `https://tiles.stadiamaps.com/styles/osm_bright.json?api_key=${process.env.EXPO_PUBLIC_STADIA_API_KEY}`;
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
  const countdownSeconds = safetyCheckDeadlineAt
    ? Math.max(0, Math.ceil((safetyCheckDeadlineAt - Date.now()) / 1000))
    : null;

  const destinationData = {
    eta: safetyStatus === 'Arrived'
      ? 'Arrived'
      : safetyStatus === 'SOS-Triggered'
        ? 'SOS'
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
  const statusData = {
    gps: "Active",
    wearable: connectedDevice ? "Connected" : "Disconnected"
  };

  const handleStopAlarm = () => {
    setIsModalVisible(true);
  };

  const handleConfirmStop = async () => {
    await sendStopCommand();
    stopAlarm();
    setIsModalVisible(false);
  };

  const handleCancelStop = () => {
    setIsModalVisible(false);
  };

  const handleAcknowledgeWake = async () => {
    await sendStopCommand();
    stopAlarm();
  };

  const showArrivalAlert = sensorData?.destinationAlarmTriggered === true;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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
              {statusData.gps}
            </Text>
          </StatusCard>

          <View style={[styles.divider, { backgroundColor: colors.hr }]} />

          <StatusCard>
            <View style={styles.cardLeft}>
              <View style={[styles.iconBox, { backgroundColor: colors.primaryIcon }]}>
                <IconSymbol name="watch" size={20} color={colors.background} />
              </View>
              <Text style={[styles.statusTitle, { color: colors.mainText }]}>
                Wearable
              </Text>
            </View>
            <Text style={[styles.statusValue, { color: connectedDevice ? colors.primaryIcon : colors.locationMarker }]}>
              {statusData.wearable}
            </Text>
          </StatusCard>
        </View>

        <View style={[styles.mapContainer, { backgroundColor: colors.avatarBorder }]}>
          <MapLibreGL.MapView 
            style={StyleSheet.absoluteFillObject}
            mapStyle={mapStyle}
            logoEnabled={false}
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
            <Text style={[styles.mapLegendTitle, { color: colors.text }]}>Trip View</Text>
            <Text style={[styles.mapLegendBody, { color: colors.subtitle }]}>
              Current location and route monitoring are shown here during the active alarm.
            </Text>
            {activeRoute && activeRoute.trafficDelaySeconds > 0 && (
              <Text style={[styles.mapLegendBody, { color: colors.warningIcon, marginTop: 4 }]}>
                Traffic on route: +{Math.max(1, Math.round(activeRoute.trafficDelaySeconds / 60))} mins
              </Text>
            )}
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
                  Trigger Zone ({distanceData.triggerZone})
                </Text>
             </View>
             
             <ProgressBar progress={isAlarmActive ? distanceData.progress : 0} triggerRatio={distanceData.triggerRatio} />
             
             <Text style={[styles.progressSubText, { color: colors.mainText }]}>
                {safetyStatus === 'Suspicious' && countdownSeconds !== null
                  ? `Safety check pending: ${countdownSeconds}s before SOS`
                  : triggerDistanceKm !== null && triggerDistanceKm > 0
                    ? `Alarm triggers in ${distanceData.triggerDistance}`
                    : 'Within trigger zone'}
              </Text>
           </View>
        </View>



        {isAlarmActive ? (
          <TouchableOpacity 
            style={[styles.actionButton, { backgroundColor: colors.locationMarker }]} 
            onPress={handleStopAlarm} 
            activeOpacity={0.8}
          >
            <IconSymbol name="check-circle" size={24} color={colors.activeText} style={{ marginRight: 8 }} />
            <Text style={[styles.actionButtonText, { color: colors.activeText }]}>
              Stop Alarm
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.actionButton, { backgroundColor: colors.hr, shadowOpacity: 0, elevation: 0 }]}>
            <Text style={[styles.actionButtonText, { color: colors.subtitle }]}>
              No Active Alarm
            </Text>
          </View>
        )}
      </ScrollView>

      <StopAlarmModal visible={isModalVisible}>
        <View style={[styles.modalIconBox, { backgroundColor: colors.background }]}>
          <IconSymbol name="alert-outline" size={40} color={colors.locationMarker} />
        </View>
        <Text style={[styles.modalTitle, { color: colors.text }]}>
          Stop Alarm?
        </Text>
        <Text style={[styles.modalMessage, { color: colors.subtitle }]}>
          Are you sure you want to stop the alarm? Make sure you are fully awake.
        </Text>
        
        <TouchableOpacity 
          style={[styles.primaryModalButton, { backgroundColor: colors.locationMarker }]} 
          onPress={handleConfirmStop} 
          activeOpacity={0.8}
        >
          <Text style={[styles.primaryModalButtonText, { color: colors.activeText }]}>
            Yes, Stop Alarm
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.secondaryModalButton, { backgroundColor: colors.buttonBackground }]} 
          onPress={handleCancelStop} 
          activeOpacity={0.8}
        >
          <Text style={[styles.secondaryModalButtonText, { color: colors.activeText }]}>
            No, Keep Monitoring
          </Text>
        </TouchableOpacity>
      </StopAlarmModal>

      <ArrivalAlertModal 
        visible={showArrivalAlert} 
        onClose={handleCancelStop} 
        onStopAlarm={handleAcknowledgeWake} 
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
    safeArea: { 
      flex: 1, 
    },
    header: {
      flexDirection: 'row', 
      alignItems: 'center', 
      justifyContent: 'center',
      paddingHorizontal: 20, 
      paddingTop: 30, 
      paddingBottom: 20,
      position: 'relative'
    },
    backButton: {
      position: 'absolute',
      left: 20,
      top: 30,
      zIndex: 1,
    },
    headerTitle: { 
      fontSize: 20, 
      fontWeight: '700', 
    },
    scrollContent: { 
      paddingHorizontal: 20, 
      paddingBottom: 40 
    },
    statusSection: {
      borderRadius: 16, 
      paddingHorizontal: 16, 
      paddingVertical: 8,
      borderWidth: 1, 
      marginBottom: 24,
    },
    divider: { 
      height: 1, 
      marginVertical: 4 
    },
    cardLeft: { 
      flexDirection: 'row', 
      alignItems: 'center' 
    },
    iconBox: { 
      borderRadius: 8, 
      padding: 8, 
      marginRight: 12 
    },
    statusTitle: { 
      fontSize: 16, 
      fontWeight: '500' 
    },
    statusValue: { 
      fontSize: 14, 
      fontWeight: '600' 
    },
    mapContainer: {
      height: 250, 
      borderRadius: 16, 
      overflow: 'hidden', 
      marginBottom: 24,
      position: 'relative', 
    },
    mapLegend: {
      position: 'absolute',
      top: 12,
      left: 12,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 8,
      maxWidth: 180,
    },
    mapLegendTitle: {
      fontSize: 12,
      fontWeight: '700',
    },
    mapLegendBody: {
      fontSize: 11,
      marginTop: 2,
      lineHeight: 15,
    },
    markerContainer: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    destRow: { 
      flexDirection: 'row', 
      justifyContent: 'space-between', 
      alignItems: 'flex-end', 
      marginBottom: 4 
    },
    destRowBottom: { 
      flexDirection: 'row', 
      justifyContent: 'space-between', 
      alignItems: 'center', 
      gap: 10 
    },
    destLabel: { 
      fontSize: 12, 
      letterSpacing: 0.5, 
      fontWeight: '500' 
    },
    destValue: { 
      fontSize: 18, 
      fontWeight: '600', 
      flex: 1 
    },
    destInput: { 
      fontSize: 18, 
      fontWeight: '600', 
      padding: 0, 
      flex: 1 
    },
    etaValue: { 
      fontSize: 20, 
      fontWeight: '700' 
    },
    distanceSection: { 
      alignItems: 'center', 
      marginVertical: 10 
    },
    distanceLabel: { 
      fontSize: 14, 
      letterSpacing: 0.5, 
      fontWeight: '500' 
    },
    distanceRow: { 
      flexDirection: 'row', 
      alignItems: 'baseline',
      marginTop: 8 
    },
    distanceBig: { 
      fontSize: 64, 
      fontWeight: '700', 
      lineHeight: 70 
    },
    distanceUnit: { 
      fontSize: 24, 
      fontWeight: '600', 
      marginLeft: 8 
    },
    progressWrapper: { 
      width: '100%', 
      paddingHorizontal: 20, 
      marginTop: 10 
    },
    progressLabels: { 
      flexDirection: 'row', 
      justifyContent: 'space-between', 
      marginBottom: 8 
    },
    progressLabelLeft: { 
      fontSize: 12, 
      fontWeight: '600' 
    },
    progressLabelRight: { 
      fontSize: 12, 
      fontWeight: '600' 
    },
    progressSubText: { 
      textAlign: 'center', 
      marginTop: 12, 
      fontSize: 13, 
      fontWeight: '500' 
    },
    actionButton: {
      flexDirection: 'row', 
      alignItems: 'center', 
      justifyContent: 'center',
      paddingVertical: 18, 
      borderRadius: 16, 
      marginTop: 20,
      shadowOpacity: 0.3, 
      shadowRadius: 10, 
      shadowOffset: { width: 0, height: 4 }, 
      elevation: 5,
    },
    actionButtonText: { 
      fontSize: 18, 
      fontWeight: '700' 
    },
    modalIconBox: {
      width: 64, 
      height: 64, 
      borderRadius: 32,
      justifyContent: 'center', 
      alignItems: 'center', 
      marginBottom: 20,
    },
    modalTitle: { 
      fontSize: 22, 
      fontWeight: '700', 
      marginBottom: 12 
    },
    modalMessage: { 
      fontSize: 16, 
      textAlign: 'center', 
      lineHeight: 24, 
      marginBottom: 32 
    },
    primaryModalButton: {
      width: '100%', 
      paddingVertical: 16, 
      borderRadius: 8,
      alignItems: 'center', 
      marginBottom: 12,
    },
    primaryModalButtonText: { 
      fontSize: 16, 
      fontWeight: '600' 
    },
    secondaryModalButton: {
      width: '100%', 
      paddingVertical: 16, 
      borderRadius: 8, 
      alignItems: 'center',
    },
    secondaryModalButtonText: { 
      fontSize: 16, 
      fontWeight: '600' 
    },
  });
