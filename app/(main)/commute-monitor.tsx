import { ArrivalAlertModal } from '@/components/alerts/arrival-alert-modal';
import { DestinationCard } from '@/components/alerts/destination-card';
import { DriverStopModal } from '@/components/alerts/driver-stop-modal';
import { ProgressBar } from '@/components/alerts/progress-bar';
import { StatusCard } from '@/components/alerts/status-card';
import { StopAlarmModal } from '@/components/alerts/stop-alarm-modal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/color';
import { useBleContext } from '@/context/ble-context';
import { DriverStopType, useMapContext } from '@/context/map-context';
import { EmergencyContact, EmergencyService } from '@/services/emergency-service';
import { SmsService } from '@/services/sms-service';
import MapLibreGL from '@maplibre/maplibre-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const _STADIA_KEY = process.env.EXPO_PUBLIC_STADIA_API_KEY;
const BASE_MAP_URL_CM = _STADIA_KEY
  ? `https://tiles.stadiamaps.com/styles/osm_bright.json?api_key=${_STADIA_KEY}`
  : 'https://tiles.stadiamaps.com/styles/osm_bright.json';
const DARK_MAP_URL_CM = _STADIA_KEY
  ? `https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json?api_key=${_STADIA_KEY}`
  : 'https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json';
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
    anomalyTriggers,
    monitoringMetrics,
    safetyCheckDeadlineAt,
    triggerEmergency,
    routeRecognitionStatus,
    isDriverStopActive,
    driverStopReason,
    driverStopType,
    driverStopSnoozeUntil,
    startDriverStop,
    endDriverStop,
    simulateAnomaly,
  } = useMapContext();
  const { connectedDevice, sensorData, sendStopCommand } = useBleContext();

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [showSafetyModal, setShowSafetyModal] = useState(false);
  const [safetyStep, setSafetyStep] = useState<'prompt' | 'reasons_route' | 'reasons_stop' | 'send_contacts'>('prompt');
  const [routeChangeReason, setRouteChangeReason] = useState<string | null>(null);
  const [longStopReason, setLongStopReason] = useState<string | null>(null);
  const [customStopReason, setCustomStopReason] = useState('');

  const [allContacts, setAllContacts] = useState<EmergencyContact[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Record<string, boolean>>({});
  const [isSendingSms, setIsSendingSms] = useState(false);

  const [routeBanner, setRouteBanner] = useState<{ type: 'reroute' | 'deviation'; message: string } | null>(null);
  const [isDriverStopModalVisible, setIsDriverStopModalVisible] = useState(false);
  const [driverStopCountdown, setDriverStopCountdown] = useState<string | null>(null);

  const isRouteDeviation = anomalyTriggers.includes('OFF_ROUTE');

  useEffect(() => {
    const fetchContacts = async () => {
      const contactsList = await EmergencyService.getContacts();
      setAllContacts(contactsList);

      const selection: Record<string, boolean> = {};
      contactsList.forEach(c => {
        selection[c.id] = c.isSelected !== false;
      });
      setSelectedContacts(selection);
    };
    fetchContacts();
  }, []);

  const STOP_REASONS = [
    { id: 'traffic', label: '🚦 Heavy Traffic' },
    { id: 'light', label: '🛑 Traffic Light / Intersection' },
    { id: 'flat_tire', label: '🚗 Vehicle Issue / Flat Tire' },
    { id: 'gas', label: '⛽ Rest Stop / Gas Station' },
    { id: 'passenger_choice', label: '📍 Drop-off / Pick-up' },
    { id: 'other', label: '❓ Other Reason' },
  ];

  useEffect(() => {
    if (safetyStatus === 'Suspicious') {
      setShowSafetyModal(true);
      setSafetyStep('prompt');
      setRouteChangeReason(null);
      setLongStopReason(null);
      setCustomStopReason('');
    } else {
      setShowSafetyModal(false);
    }
  }, [safetyStatus]);

  useEffect(() => {
    if (!isAlarmActive) return;
    if (routeRecognitionStatus === 'Confirmed Reroute') {
      setRouteBanner({ type: 'reroute', message: '🔀 Route Changed — Alerto updated your path to match a new route.' });
    } else if (routeRecognitionStatus === 'Unrecognized Route') {
      setRouteBanner({ type: 'deviation', message: '⚠️ Route Deviation — You appear to be off your planned route. Please confirm you are safe.' });
    }
  }, [routeRecognitionStatus, isAlarmActive]);

  // Driver stop countdown timer
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

  const handleDriverStopConfirm = (reason: string, stopType: DriverStopType, durationMinutes: number) => {
    startDriverStop(reason, stopType, durationMinutes);
    setIsDriverStopModalVisible(false);
    // Also dismiss safety modal if open
    setShowSafetyModal(false);
  };

  const handleSendSosAlert = async () => {
    const contactsToSend = allContacts.filter(c => selectedContacts[c.id]);
    if (contactsToSend.length === 0) {
      Alert.alert('No Contacts Selected', 'Please select at least one contact.');
      return;
    }
    setIsSendingSms(true);
    try {
      let locationUrl = "";
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        locationUrl = `https://alerto-web-system.vercel.app/map?lat=${loc.coords.latitude}&lng=${loc.coords.longitude}`;
      } catch (err) {
        if (currentCoords) {
          locationUrl = `https://alerto-web-system.vercel.app/map?lat=${currentCoords[1]}&lng=${currentCoords[0]}`;
        }
      }

      // Load active ride details
      let rideDetails = {
        bookingType: 'Commute Monitor',
        plateNumber: 'NONE',
        driverName: 'N/A',
        carModel: 'N/A',
      };
      try {
        const stored = await AsyncStorage.getItem('@active_ride_details');
        if (stored) {
          const parsed = JSON.parse(stored);
          rideDetails = {
            bookingType: parsed.bookingType || 'Commute Monitor',
            plateNumber: parsed.plateNumber || 'NONE',
            driverName: parsed.driverName || 'N/A',
            carModel: parsed.carModel || 'N/A',
          };
        }
      } catch (err) {
        console.log(err);
      }

      const incidentType = isRouteDeviation ? 'Route Changed Deviation' : 'Long Stop Alert';
      const msg = SmsService.formatEmergencyMessage({
        bookingType: rideDetails.bookingType,
        plateNumber: rideDetails.plateNumber,
        driverName: rideDetails.driverName,
        carModel: rideDetails.carModel,
        locationUrl,
        senderName: user?.name || user?.email || 'Alerto User',
        senderEmail: user?.email,
        isEmergency: true,
        incidentReason: `${incidentType} - Commuter reported feeling unsafe`,
      });

      let sentCount = 0;
      for (const contact of contactsToSend) {
        const res = await SmsService.sendSms(contact.phoneNumber, msg);
        if (res.success) sentCount++;
      }

      await triggerEmergency(`${incidentType} - Commuter reported feeling unsafe`);
      setShowSafetyModal(false);

      Alert.alert('Emergency Alert Sent', `Emergency alerts sent to ${sentCount} contact(s).`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to dispatch emergency alerts.');
    } finally {
      setIsSendingSms(false);
    }
  };

  const theme = useColorScheme() ?? 'light';
  const colors = Colors[theme as 'light' | 'dark'];
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
  const countdownSeconds = safetyCheckDeadlineAt
    ? Math.max(0, Math.ceil((safetyCheckDeadlineAt - Date.now()) / 1000))
    : null;

  const formatCountdown = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const destinationData = {
    eta: safetyStatus === 'Arrived'
      ? 'Arrived'
      : safetyStatus === 'SOS-Triggered'
        ? 'Emergency'
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
      {/* Route change banner */}
      {routeBanner && (
        <View style={[
          styles.routeBanner,
          { backgroundColor: routeBanner.type === 'reroute' ? '#1d4ed8' : '#b45309' }
        ]}>
          <Text style={styles.routeBannerText}>{routeBanner.message}</Text>
          <TouchableOpacity onPress={() => setRouteBanner(null)} style={styles.routeBannerClose}>
            <IconSymbol name="xmark" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
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
                  Monitoring Paused
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
                Bag
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
                ? `Safety check pending: ${countdownSeconds}s before Emergency Alert`
                : triggerDistanceKm !== null && triggerDistanceKm > 0
                  ? `Alarm triggers in ${distanceData.triggerDistance}`
                  : 'Within trigger zone'}
            </Text>
          </View>
        </View>



        {isAlarmActive ? (
          <View>
            {/* Report Stop button - shown when alarm is active and no stop is in progress */}
            {!isDriverStopActive && (
              <TouchableOpacity
                style={[styles.reportStopButton, { backgroundColor: colors.configColor, borderColor: colors.hr }]}
                onPress={() => setIsDriverStopModalVisible(true)}
                activeOpacity={0.8}
              >
                <IconSymbol name="pause-circle" size={20} color={colors.primaryIcon} style={{ marginRight: 8 }} />
                <Text style={[styles.reportStopText, { color: colors.primaryIcon }]}>
                  Report Driver Stop
                </Text>
              </TouchableOpacity>
            )}

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
          </View>
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

      <Modal
        visible={showSafetyModal}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.safetyModalContainer, { backgroundColor: theme === 'dark' ? '#1e2123' : '#ffffff', borderColor: colors.hr }]}>
            {safetyStep === 'prompt' && (
              <>
                <View style={[styles.modalIconBox, { backgroundColor: colors.primaryIcon + '15' }]}>
                  <IconSymbol name="alert-outline" size={40} color={colors.primaryIcon} />
                </View>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  {isRouteDeviation ? 'Route Changed Detected' : 'Long Stop Detected'}
                </Text>
                <Text style={[styles.modalMessage, { color: colors.subtitle }]}>
                  {isRouteDeviation 
                    ? 'We noticed an unexpected change in your route. Do you feel safe with this change route?' 
                    : 'We noticed a long stop on your trip. Do you feel safe?'}
                </Text>
                
                {countdownSeconds !== null && (
                  <Text style={[styles.countdownTextSmall, { color: colors.locationMarker, marginBottom: 15 }]}>
                    Automatic Emergency Alert triggers in {formatCountdown(countdownSeconds)}
                  </Text>
                )}

                <View style={styles.promptButtonsRow}>
                  <TouchableOpacity 
                    style={[styles.choiceBtn, { backgroundColor: colors.primaryIcon, borderColor: colors.primaryIcon }]} 
                    onPress={() => setSafetyStep(isRouteDeviation ? 'reasons_route' : 'reasons_stop')}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.choiceBtnText, { color: '#ffffff' }]}>Yes</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[styles.choiceBtn, { backgroundColor: colors.buttonBackground, borderColor: colors.hr }]} 
                    onPress={() => setSafetyStep('send_contacts')} 
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.choiceBtnText, { color: colors.activeText }]}>No</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {safetyStep === 'reasons_route' && (
              <>
                <Text style={[styles.modalTitle, { color: colors.text, marginBottom: 8, textAlign: 'center' }]}>
                  Reason for route change:
                </Text>
                <Text style={[styles.modalMessageSub, { color: colors.subtitle, marginBottom: 16 }]}>
                  Please let us know why you changed route to resume trip.
                </Text>

                <ScrollView contentContainerStyle={{ gap: 8 }} style={{ maxHeight: 220, width: '100%' }} showsVerticalScrollIndicator={false}>
                  {['Shortcut', 'Avoid Traffic', 'Closed/ Blocked Road'].map((item) => (
                    <TouchableOpacity
                      key={item}
                      style={[
                        styles.reasonItem,
                        { borderColor: colors.hr, backgroundColor: routeChangeReason === item ? colors.primaryIcon + '15' : 'transparent' }
                      ]}
                      onPress={() => {
                        setRouteChangeReason(item);
                        setCustomStopReason('');
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.reasonText, { color: colors.text, fontWeight: routeChangeReason === item ? '700' : '400' }]}>
                        {item}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  
                  <TouchableOpacity
                    style={[
                      styles.reasonItem,
                      { borderColor: colors.hr, backgroundColor: routeChangeReason === 'Others' ? colors.primaryIcon + '15' : 'transparent' }
                    ]}
                    onPress={() => setRouteChangeReason('Others')}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.reasonText, { color: colors.text, fontWeight: routeChangeReason === 'Others' ? '700' : '400' }]}>
                      Others...
                    </Text>
                  </TouchableOpacity>

                  {routeChangeReason === 'Others' && (
                    <TextInput
                      style={{
                        borderWidth: 1.5,
                        borderRadius: 12,
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        fontSize: 15,
                        marginTop: 10,
                        width: '100%',
                        borderColor: colors.hr,
                        color: colors.text,
                        backgroundColor: colors.background
                      }}
                      placeholder="Type reason here..."
                      placeholderTextColor={colors.subtitle + '80'}
                      value={customStopReason}
                      onChangeText={setCustomStopReason}
                    />
                  )}
                </ScrollView>

                <TouchableOpacity 
                  style={[
                    styles.primaryModalButton, 
                    { backgroundColor: (routeChangeReason && (routeChangeReason !== 'Others' || customStopReason.trim().length > 0)) ? colors.primaryIcon : colors.hr, marginTop: 20 }
                  ]} 
                  disabled={!routeChangeReason || (routeChangeReason === 'Others' && customStopReason.trim().length === 0)}
                  onPress={() => {
                    confirmSafety();
                    setShowSafetyModal(false);
                  }} 
                  activeOpacity={0.8}
                >
                  <Text style={[styles.primaryModalButtonText, { color: (routeChangeReason && (routeChangeReason !== 'Others' || customStopReason.trim().length > 0)) ? colors.activeText : colors.subtitle }]}>
                    Submit and Resume
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {safetyStep === 'reasons_stop' && (
              <>
                <Text style={[styles.modalTitle, { color: colors.text, marginBottom: 8, textAlign: 'center' }]}>
                  Reason for long stop:
                </Text>
                <Text style={[styles.modalMessageSub, { color: colors.subtitle, marginBottom: 16 }]}>
                  Please choose a reason to continue trip monitoring.
                </Text>

                <ScrollView contentContainerStyle={{ gap: 8 }} style={{ maxHeight: 220, width: '100%' }} showsVerticalScrollIndicator={false}>
                  {['Traffic', 'Gas Station', 'Bathroom break', 'Toll gate', 'Route Stop'].map((item) => (
                    <TouchableOpacity
                      key={item}
                      style={[
                        styles.reasonItem,
                        { borderColor: colors.hr, backgroundColor: longStopReason === item ? colors.primaryIcon + '15' : 'transparent' }
                      ]}
                      onPress={() => {
                        setLongStopReason(item);
                        setCustomStopReason('');
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.reasonText, { color: colors.text, fontWeight: longStopReason === item ? '700' : '400' }]}>
                        {item}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  
                  <TouchableOpacity
                    style={[
                      styles.reasonItem,
                      { borderColor: colors.hr, backgroundColor: longStopReason === 'Others' ? colors.primaryIcon + '15' : 'transparent' }
                    ]}
                    onPress={() => setLongStopReason('Others')}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.reasonText, { color: colors.text, fontWeight: longStopReason === 'Others' ? '700' : '400' }]}>
                      Others...
                    </Text>
                  </TouchableOpacity>

                  {longStopReason === 'Others' && (
                    <TextInput
                      style={{
                        borderWidth: 1.5,
                        borderRadius: 12,
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        fontSize: 15,
                        marginTop: 10,
                        width: '100%',
                        borderColor: colors.hr,
                        color: colors.text,
                        backgroundColor: colors.background
                      }}
                      placeholder="Type reason here..."
                      placeholderTextColor={colors.subtitle + '80'}
                      value={customStopReason}
                      onChangeText={setCustomStopReason}
                    />
                  )}
                </ScrollView>

                <TouchableOpacity 
                  style={[
                    styles.primaryModalButton, 
                    { backgroundColor: (longStopReason && (longStopReason !== 'Others' || customStopReason.trim().length > 0)) ? colors.primaryIcon : colors.hr, marginTop: 20 }
                  ]} 
                  disabled={!longStopReason || (longStopReason === 'Others' && customStopReason.trim().length === 0)}
                  onPress={() => {
                    confirmSafety();
                    setShowSafetyModal(false);
                  }} 
                  activeOpacity={0.8}
                >
                  <Text style={[styles.primaryModalButtonText, { color: (longStopReason && (longStopReason !== 'Others' || customStopReason.trim().length > 0)) ? colors.activeText : colors.subtitle }]}>
                    Submit and Resume
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {safetyStep === 'send_contacts' && (
              <>
                <Text style={[styles.modalTitle, { color: colors.text, marginBottom: 8, textAlign: 'center' }]}>
                  Send details to emergency contacts
                </Text>
                <Text style={[styles.modalMessageSub, { color: colors.subtitle, marginBottom: 16 }]}>
                  Toggle the contacts you want to alert with your active ride and destination info.
                </Text>

                <View style={[styles.selectAllHeaderRow, { justifyContent: 'flex-end', borderBottomColor: colors.hr }]}>
                  <TouchableOpacity
                    style={styles.selectAllBtn}
                    onPress={() => {
                      const allSelected = Object.values(selectedContacts).every(v => v);
                      const nextSelection: Record<string, boolean> = {};
                      allContacts.forEach(c => {
                        nextSelection[c.id] = !allSelected;
                      });
                      setSelectedContacts(nextSelection);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.selectAllTextLabel, { color: colors.text, marginRight: 6 }]}>Select All</Text>
                    <IconSymbol 
                      name={allContacts.length > 0 && Object.values(selectedContacts).every(v => v) ? "checkmark.square.fill" : "square"} 
                      size={18} 
                      color={colors.activeCard} 
                    />
                  </TouchableOpacity>
                </View>

                <ScrollView style={{ maxHeight: 180, width: '100%' }} showsVerticalScrollIndicator={false}>
                  {allContacts.length === 0 ? (
                    <Text style={[styles.noContactsLabelText, { color: colors.subtitle }]}>No contacts registered.</Text>
                  ) : (
                    allContacts.map((contact) => {
                      const isChecked = selectedContacts[contact.id] ?? false;
                      return (
                        <TouchableOpacity
                          key={contact.id}
                          style={styles.contactSelectRow}
                          onPress={() => {
                            setSelectedContacts(prev => ({ ...prev, [contact.id]: !isChecked }));
                          }}
                          activeOpacity={0.8}
                        >
                          <IconSymbol 
                            name={isChecked ? "checkmark.circle.fill" : "circle"} 
                            size={20} 
                            color={isChecked ? colors.activeCard : colors.subtitle + '40'} 
                          />
                          <Text style={[styles.contactSelectNameText, { color: colors.text }]}>
                            {contact.firstName} {contact.lastName} ({contact.relationship})
                          </Text>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </ScrollView>

                <View style={styles.modalAlertActions}>
                  <TouchableOpacity 
                    style={[
                      styles.primaryModalButton, 
                      { backgroundColor: Object.values(selectedContacts).some(v => v) ? colors.locationMarker : colors.hr }
                    ]} 
                    disabled={!Object.values(selectedContacts).some(v => v) || isSendingSms}
                    onPress={handleSendSosAlert} 
                    activeOpacity={0.8}
                  >
                    {isSendingSms ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={[styles.primaryModalButtonText, { color: Object.values(selectedContacts).some(v => v) ? colors.activeText : colors.subtitle }]}>
                        Send Emergency Alert
                      </Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[styles.secondaryModalButton, { backgroundColor: colors.buttonBackground, marginTop: 8 }]} 
                    onPress={() => setSafetyStep('prompt')} 
                    disabled={isSendingSms}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.secondaryModalButtonText, { color: colors.activeText }]}>
                      Back
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      <DriverStopModal
        visible={isDriverStopModalVisible}
        onClose={() => setIsDriverStopModalVisible(false)}
        onConfirm={handleDriverStopConfirm}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  routeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  routeBannerText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    lineHeight: 18,
  },
  routeBannerClose: {
    marginLeft: 10,
    padding: 4,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  safetyModalContainer: {
    width: '100%',
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  countdownTextSmall: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalMessageSub: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  reasonsList: {
    width: '100%',
    gap: 8,
  },
  reasonItem: {
    width: '100%',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  reasonText: {
    fontSize: 15,
  },
  driverStopBanner: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  driverStopBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  driverStopIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  driverStopTextArea: {
    flex: 1,
  },
  driverStopTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  driverStopReasonText: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  driverStopTimer: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 3,
  },
  driverStopResumeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    marginLeft: 10,
  },
  driverStopResumeBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  reportStopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    marginTop: 14,
  },
  reportStopText: {
    fontSize: 15,
    fontWeight: '600',
  },
  promptButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginTop: 15,
  },
  choiceBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
  modalMessageSub: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 10,
  },
  othersInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    marginTop: 6,
    width: '100%',
  },
  selectAllHeaderRow: {
    width: '100%',
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
    marginBottom: 8,
  },
  selectAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  selectAllTextLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  contactSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    width: '100%',
  },
  contactSelectNameText: {
    fontSize: 14,
  },
  noContactsLabelText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },
  modalAlertActions: {
    width: '100%',
    marginTop: 15,
  },
});
