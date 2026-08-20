import { StopAlarmModal } from '@/components/alerts/stop-alarm-modal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ModalContainer } from '@/components/ui/modal-container';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/color';
import { useAuth } from '@/context/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EmergencyService } from '@/services/emergency-service';
import { MonitoringAnalyticsService } from '@/services/monitoring-analytics';
import { SmsService } from '@/services/sms-service';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, useColorScheme, Vibration, View, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAntiTheftBle } from '@/context/anti-theft-ble-context';
import { BleAntiTheftModal } from '@/components/ui/ble-anti-theft-modal';

const ANTI_THEFT_SMS_TIMEOUT_MS = 30 * 1000;
type AntiTheftSmsSource = 'timeout' | 'manual';


const _HEARTBEAT_LOCALHOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
const HEARTBEAT_API_URL = process.env.EXPO_PUBLIC_API_URL || `http://${_HEARTBEAT_LOCALHOST}:3000/api/mobile`;

async function sendAntiTheftHeartbeat(
  userId: string,
  active: boolean,
  email?: string,
  deviceId?: string,
  safetyStatus?: string
) {
  try {
    await fetch(`${HEARTBEAT_API_URL}/commute/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, active, safetyStatus }),
    });

    if (email && deviceId) {
      await fetch(`${HEARTBEAT_API_URL}/device-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, deviceId, connected: active }),
      });
    }
  } catch (e) {
    console.warn('Anti-theft heartbeat failed:', e);
  }
}

export default function AntiTheftMonitorScreen() {
  const router = useRouter();
  const theme = useColorScheme() ?? 'light';
  const colors = Colors[theme as 'light' | 'dark'];
  const { user } = useAuth();

  const {
    connectedDevice,
    connectionStatus,
    isScanning,
    devices,
    isSimulated,
    reedSafe,
    ldrSafe,
    mpuSafe,
    enableReed,
    enableLdr,
    enableMpu,
    enableBuzzer,
    isMonitoringEnabled,
    isAlerting,
    alertType,
    startScan,
    stopScan,
    connect,
    disconnect,
    armSystem,
    disarmSystem,
    dismissAlarm,
    setEnableReed,
    setEnableLdr,
    setEnableMpu,
    setEnableBuzzer,
    enableSimulation,
    triggerSimulatedAlert,
  } = useAntiTheftBle();

  
  const [showPairModal, setShowPairModal] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState(30);
  const [alertLocationName, setAlertLocationName] = useState<string>('Detecting location...');
  const [alertDate, setAlertDate] = useState<Date | null>(null);

  const [toggleModalVisible, setToggleModalVisible] = useState(false);
  const [pendingToggle, setPendingToggle] = useState<{ sensor: 'reed' | 'ldr' | 'mpu' | 'buzzer', value: boolean } | null>(null);
  const [dontShowAgainChecked, setDontShowAgainChecked] = useState(false);

  const antiTheftSmsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const antiTheftSmsSentRef = useRef(false);
  const antiTheftAnalyticsRecordedRef = useRef(false);
  const analyticsUserId = user?.id || user?._id;

  const clearAntiTheftSmsTimer = useCallback(() => {
    if (antiTheftSmsTimeoutRef.current) {
      clearTimeout(antiTheftSmsTimeoutRef.current);
      antiTheftSmsTimeoutRef.current = null;
    }
  }, []);

  const getAntiTheftIncidentReason = useCallback(() => {
    if (enableMpu && !mpuSafe) return 'Snatch or movement detected';
    if (enableLdr && !ldrSafe) return 'Light or tampering detected';
    if (enableReed && !reedSafe) return 'Zipper or bag opening detected';
    return 'Anti-theft intrusion detected';
  }, [enableLdr, enableMpu, enableReed, ldrSafe, mpuSafe, reedSafe]);

  const sendAntiTheftEmergencySms = useCallback(async (source: AntiTheftSmsSource) => {
    if (antiTheftSmsSentRef.current) return false;

    const smsPreference = await AsyncStorage.getItem('alerto_sms_enabled');
    if (smsPreference === 'false') {
      if (source === 'manual') {
        Alert.alert('SMS Alerts Disabled', 'Enable emergency SMS alerts in Settings before sending this alert.');
      }
      return false;
    }

    const contacts = (await EmergencyService.getContacts()).filter(contact => contact.isSelected !== false);
    if (contacts.length === 0) {
      Alert.alert('No Emergency Contacts', 'Add or select an emergency contact in Settings to receive anti-theft SMS alerts.');
      return false;
    }

    antiTheftSmsSentRef.current = true;

    let locationUrl = '';
    try {
      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.status === 'granted') {
        const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        locationUrl = `https://alerto-web-system.vercel.app/map?lat=${location.coords.latitude}&lng=${location.coords.longitude}`;
      }
    } catch {
      // The emergency SMS can still be sent when location is unavailable.
    }

    const reason = getAntiTheftIncidentReason();
    const message = SmsService.formatEmergencyMessage({
      bookingType: 'Anti-Theft Monitoring',
      plateNumber: 'N/A',
      driverName: 'N/A',
      carModel: 'Alerto Anti-Theft Module',
      locationUrl,
      senderName: user?.name || user?.email || 'Alerto User',
      senderEmail: user?.email,
      isEmergency: true,
      incidentReason: source === 'timeout'
        ? `${reason} - no shake or phone dismissal within 30 seconds`
        : `${reason} - emergency alert triggered from the phone`,
    });

    let sentCount = 0;
    for (const contact of contacts) {
      const result = await SmsService.sendSms(contact.phoneNumber, message);
      if (result.success) sentCount += 1;
    }

    void saveAntiTheftTrip('SOS Sent');
    Alert.alert(
      sentCount > 0 ? 'Emergency Alert Sent' : 'Emergency SMS Failed',
      sentCount > 0
        ? `Anti-theft alerts sent to ${sentCount} emergency contact(s).`
        : 'The emergency SMS could not be sent. Check your SMS provider configuration and contact numbers.',
    );

    return sentCount > 0;
  }, [getAntiTheftIncidentReason, user?.email, user?.name]);

  const antiTheftSmsHandlerRef = useRef<(source: AntiTheftSmsSource) => Promise<boolean>>(async () => false);

  useEffect(() => {
    antiTheftSmsHandlerRef.current = sendAntiTheftEmergencySms;
  }, [sendAntiTheftEmergencySms]);

  useEffect(() => {
    if (!isAlerting) {
      clearAntiTheftSmsTimer();
      antiTheftSmsSentRef.current = false;
      return;
    }

    if (!antiTheftSmsTimeoutRef.current && !antiTheftSmsSentRef.current) {
      antiTheftSmsTimeoutRef.current = setTimeout(() => {
        antiTheftSmsTimeoutRef.current = null;
        void antiTheftSmsHandlerRef.current('timeout');
      }, ANTI_THEFT_SMS_TIMEOUT_MS);
    }
  }, [clearAntiTheftSmsTimer, isAlerting]);

  useEffect(() => clearAntiTheftSmsTimer, [clearAntiTheftSmsTimer]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isAlerting) {
      setShowModal(true);
      setCountdownSeconds(30);
      setAlertDate(new Date());
      setAlertLocationName('Fetching location...');

      (async () => {
        try {
          const { status } = await Location.getForegroundPermissionsAsync();
          if (status === 'granted') {
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            const [address] = await Location.reverseGeocodeAsync({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude
            });
            if (address) {
              setAlertLocationName(`${address.street || address.name || ''}, ${address.city || address.region || ''}`);
            } else {
              setAlertLocationName('Location detected');
            }
          } else {
            setAlertLocationName('Location permission denied');
          }
        } catch {
          setAlertLocationName('Unknown location');
        }
      })();

      interval = setInterval(() => {
        setCountdownSeconds(prev => (prev > 0 ? prev - 1 : 0));
      }, 1000);

      if (!antiTheftAnalyticsRecordedRef.current) {
        antiTheftAnalyticsRecordedRef.current = true;
        void MonitoringAnalyticsService.recordAntiTheftEvent(analyticsUserId);
      }
      if (Platform.OS !== 'web') {
        Vibration.vibrate([200, 500, 200, 500], true); 
      }
    } else {
      setShowModal(false);
      antiTheftAnalyticsRecordedRef.current = false;
      Vibration.cancel();
    }
    return () => clearInterval(interval);
  }, [analyticsUserId, isAlerting]);

  useEffect(() => {
    return () => Vibration.cancel();
  }, []);

  // Anti-theft heartbeat: signal active status to dashboard while armed or connected
  const isAntiTheftActive = connectionStatus === 'armed' || isMonitoringEnabled || connectionStatus === 'connected';

  useEffect(() => {
    if (!isAntiTheftActive || !user?.id) return;

    const deviceId = connectedDevice?.id;
    const status = isAlerting ? 'SOS-Triggered' : 'Normal';
    sendAntiTheftHeartbeat(user.id, true, user.email, deviceId, status);

    const interval = setInterval(() => {
      const currentStatus = isAlerting ? 'SOS-Triggered' : 'Normal';
      sendAntiTheftHeartbeat(user.id, true, user.email, deviceId, currentStatus);
    }, 10_000);

    return () => {
      clearInterval(interval);
      if (user?.id) {
        sendAntiTheftHeartbeat(user.id, false, user.email, deviceId);
      }
    };
  }, [isAntiTheftActive, user?.id, user?.email, connectedDevice?.id, isAlerting]);


  const getStatusText = () => {
    if (isAlerting) {
      if (alertType === 3 || (enableMpu && !mpuSafe)) return 'INTRUSION DETECTED: Motion';
      if (alertType === 2 || (enableLdr && !ldrSafe)) return 'INTRUSION DETECTED: Light';
      if (alertType === 1 || (enableReed && !reedSafe)) return 'INTRUSION DETECTED: Zipper';
      return 'INTRUSION DETECTED';
    }
    switch (connectionStatus) {
      case 'scanning':
        return 'Scanning for Bag Tag...';
      case 'connecting':
        return 'Connecting to Bag Tag...';
      case 'connected':
        return 'Connected & Ready';
      case 'calibrating':
        return 'Calibrating Sensors...';
      case 'armed':
        return isMonitoringEnabled ? 'System Armed & Safe' : 'Anti-Theft Disabled';
      case 'disconnected':
      default:
        return 'Disconnected';
    }
  };

  const getStatusColor = () => {
    if (isAlerting) return colors.locationMarker;
    if (connectionStatus === 'armed') return colors.lightning;
    if (connectionStatus === 'connected') return colors.brand;
    if (connectionStatus === 'calibrating') return '#eab308';
    return colors.subtitle;
  };

  
  const handleToggle = async (sensor: 'reed' | 'ldr' | 'mpu' | 'buzzer', value: boolean) => {
    const skipWarning = await AsyncStorage.getItem(`alerto_skip_toggle_warning_${sensor}`);
    if (skipWarning === 'true') {
      applyToggle(sensor, value);
    } else {
      setPendingToggle({ sensor, value });
      setDontShowAgainChecked(false);
      setToggleModalVisible(true);
    }
  };

  const applyToggle = (sensor: 'reed' | 'ldr' | 'mpu' | 'buzzer', value: boolean) => {
    switch (sensor) {
      case 'reed': setEnableReed(value); break;
      case 'ldr': setEnableLdr(value); break;
      case 'mpu': setEnableMpu(value); break;
      case 'buzzer': setEnableBuzzer(value); break;
    }
  };

  const confirmToggle = async () => {
    if (pendingToggle) {
      if (dontShowAgainChecked) {
        await AsyncStorage.setItem(`alerto_skip_toggle_warning_${pendingToggle.sensor}`, 'true');
      }
      applyToggle(pendingToggle.sensor, pendingToggle.value);
    }
    setToggleModalVisible(false);
    setPendingToggle(null);
    setDontShowAgainChecked(false);
  };

  const saveAntiTheftTrip = async (resolvedBy: 'User Dismissed' | 'SOS Sent') => {
    if (!user?.id) return;
    try {
      const LOCALHOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
      const API_URL = process.env.EXPO_PUBLIC_API_URL || `http://${LOCALHOST}:3000/api/mobile`;
      await fetch(`${API_URL}/trips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          type: 'anti_theft',
          destinationName: "Anti-Theft Intrusion",
          locationName: alertLocationName,
          durationMs: 0,
          alertsTriggeredCount: 1,
          responseTimes: [30000 - (countdownSeconds * 1000)],
          unsafeZonesEncountered: [],
          anomalyTriggers: [getAntiTheftIncidentReason()],
          safetyStatus: resolvedBy === 'SOS Sent' ? 'SOS-Triggered' : 'Normal',
          date: new Date().toISOString()
        })
      });
    } catch (e) {
      console.warn('Failed to save anti-theft trip:', e);
    }
  };

  const handleDismissAlert = () => {
    clearAntiTheftSmsTimer();
    dismissAlarm();
    setShowModal(false);
    Vibration.cancel();
    void saveAntiTheftTrip('User Dismissed');
  };

  const handleTriggerSos = async () => {
    await sendAntiTheftEmergencySms('manual');
    handleDismissAlert();
  };


  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <IconSymbol name="chevron.left" size={28} color={colors.icon} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.mainText }]}>
          Anti-Theft Tracking
        </Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        
        <View style={[styles.statusBanner, { backgroundColor: isAlerting ? colors.dangerBg : (connectionStatus === 'armed' ? colors.watchEsp : colors.card), borderColor: getStatusColor() }]}>
          <IconSymbol 
            name={isAlerting ? "shield-alert" : "shield-check"} 
            size={32} 
            color={getStatusColor()} 
            style={{ marginBottom: 8 }}
          />
          <Text style={[styles.statusLabel, { color: colors.mainText }]}>Status</Text>
          <Text style={[styles.statusValue, { color: getStatusColor() }]}>{getStatusText()}</Text>
        </View>

        {/* BLE Connection Control Panel */}
        <View style={[styles.bleCard, { backgroundColor: colors.card, borderColor: colors.hr }]}>
          <View style={styles.bleHeader}>
            <View style={[styles.bleIconCircle, { backgroundColor: connectionStatus === 'disconnected' ? colors.dangerBg : colors.watchEsp }]}>
              <IconSymbol 
                name={connectionStatus === 'disconnected' ? "bluetooth-off" : "bluetooth"} 
                size={22} 
                color={connectionStatus === 'disconnected' ? colors.subtitle : colors.brand} 
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.bleTitle, { color: colors.mainText }]}>
                Alerto Bag Gateway
              </Text>
              <Text style={[styles.bleSubtitle, { color: colors.subtitle }]}>
                {connectionStatus === 'disconnected' 
                  ? 'Disconnected - Please pair your module from Settings' 
                  : 'Module is Connected'}
              </Text>
            </View>
          </View>

          {connectionStatus === 'connected' ? (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => void armSystem(enableReed, enableLdr, enableMpu)}
              style={[styles.primaryBleButton, { backgroundColor: colors.lightning }]}
            >
              <IconSymbol name="shield-check" size={18} color="#ffffff" style={{ marginRight: 8 }} />
              <Text style={styles.primaryBleButtonText}>Start Monitoring</Text>
            </TouchableOpacity>
          ) : connectionStatus === 'armed' ? (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                Alert.alert(
                  "Disable Anti-Theft",
                  "Are you sure you want to stop active bag monitoring and disarm the system?",
                  [
                    { text: "Cancel", style: "cancel" },
                    { 
                      text: "Disable", 
                      style: "destructive", 
                      onPress: () => {
                        void disarmSystem();
                      } 
                    }
                  ]
                );
              }}
              style={[styles.primaryBleButton, { backgroundColor: colors.locationMarker }]}
            >
              <IconSymbol name="shield-off" size={18} color="#ffffff" style={{ marginRight: 8 }} />
              <Text style={styles.primaryBleButtonText}>Disable Anti-Theft</Text>
            </TouchableOpacity>
          ) : null}

          {/* Simulator Quick Triggers inside the panel */}
          {isSimulated && connectionStatus === 'armed' && (
            <View style={[styles.simulationBox, { borderTopColor: colors.hr }]}>
              <Text style={[styles.simulationTitle, { color: colors.mainText }]}>
                🛠️ Simulator: Trigger Intrusion
              </Text>
              <View style={styles.simulationButtonsRow}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => triggerSimulatedAlert(1)}
                  style={[styles.simTriggerBtn, { backgroundColor: colors.dangerBg, borderColor: colors.locationMarker }]}
                >
                  <Text style={[styles.simTriggerText, { color: colors.locationMarker }]}>Open Zipper</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => triggerSimulatedAlert(2)}
                  style={[styles.simTriggerBtn, { backgroundColor: colors.dangerBg, borderColor: colors.locationMarker }]}
                >
                  <Text style={[styles.simTriggerText, { color: colors.locationMarker }]}>Slash/Light</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => triggerSimulatedAlert(3)}
                  style={[styles.simTriggerBtn, { backgroundColor: colors.dangerBg, borderColor: colors.locationMarker }]}
                >
                  <Text style={[styles.simTriggerText, { color: colors.locationMarker }]}>Snatch (MPU)</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.mainText, marginTop: 10 }]}>Live Sensor Data</Text>

        <View style={styles.sensorGrid}>
          {/* Reed Switch */}
          <View style={[styles.sensorCard, { backgroundColor: colors.card, borderColor: (!reedSafe && enableReed) ? colors.locationMarker : colors.hr, opacity: enableReed ? 1 : 0.6 }]}>
            <View style={styles.sensorHeader}>
              <View style={[styles.iconBox, { backgroundColor: (!reedSafe && enableReed) ? colors.dangerBg : colors.watchEsp }]}>
                <IconSymbol name="lock-open-variant" size={20} color={(!reedSafe && enableReed) ? colors.locationMarker : colors.lightning} />
              </View>
              <Text style={[styles.sensorTitle, { color: colors.mainText }]}>Zipper (Reed)</Text>
              <View style={{ flex: 1 }} />
              <Switch 
                value={enableReed} 
                onValueChange={(v) => handleToggle('reed', v)} 
                trackColor={{ true: colors.brand, false: colors.hr }} 
                thumbColor={Platform.OS === 'android' ? (enableReed ? colors.brand : '#f4f3f4') : undefined}
              />
            </View>
            <Text style={[styles.sensorState, { color: (!reedSafe && enableReed) ? colors.locationMarker : colors.subtitle }]}>
              {reedSafe ? 'Closed (Safe)' : (enableReed ? 'Opened (Intrusion)' : 'Opened (Ignored)')}
            </Text>
          </View>

          {/* LDR */}
          <View style={[styles.sensorCard, { backgroundColor: colors.card, borderColor: (!ldrSafe && enableLdr) ? colors.locationMarker : colors.hr, opacity: enableLdr ? 1 : 0.6 }]}>
            <View style={styles.sensorHeader}>
              <View style={[styles.iconBox, { backgroundColor: (!ldrSafe && enableLdr) ? colors.dangerBg : colors.watchEsp }]}>
                <IconSymbol name="weather-sunny" size={20} color={(!ldrSafe && enableLdr) ? colors.locationMarker : colors.lightning} />
              </View>
              <Text style={[styles.sensorTitle, { color: colors.mainText }]}>Light (LDR)</Text>
              <View style={{ flex: 1 }} />
              <Switch 
                value={enableLdr} 
                onValueChange={(v) => handleToggle('ldr', v)} 
                trackColor={{ true: colors.brand, false: colors.hr }} 
                thumbColor={Platform.OS === 'android' ? (enableLdr ? colors.brand : '#f4f3f4') : undefined}
              />
            </View>
            <Text style={[styles.sensorState, { color: (!ldrSafe && enableLdr) ? colors.locationMarker : colors.subtitle }]}>
              {ldrSafe ? 'Dark (Safe)' : (enableLdr ? 'Light Intrusion' : 'Light (Ignored)')}
            </Text>
          </View>

          {/* MPU6050 */}
          <View style={[styles.sensorCard, { backgroundColor: colors.card, borderColor: (!mpuSafe && enableMpu) ? colors.locationMarker : colors.hr, opacity: enableMpu ? 1 : 0.6 }]}>
            <View style={styles.sensorHeader}>
              <View style={[styles.iconBox, { backgroundColor: (!mpuSafe && enableMpu) ? colors.dangerBg : colors.watchEsp }]}>
                <IconSymbol name="run" size={20} color={(!mpuSafe && enableMpu) ? colors.locationMarker : colors.lightning} />
              </View>
              <Text style={[styles.sensorTitle, { color: colors.mainText }]}>Motion (MPU)</Text>
              <View style={{ flex: 1 }} />
              <Switch 
                value={enableMpu} 
                onValueChange={(v) => handleToggle('mpu', v)} 
                trackColor={{ true: colors.brand, false: colors.hr }} 
                thumbColor={Platform.OS === 'android' ? (enableMpu ? colors.brand : '#f4f3f4') : undefined}
              />
            </View>
            <Text style={[styles.sensorState, { color: (!mpuSafe && enableMpu) ? colors.locationMarker : colors.subtitle }]}>
              {mpuSafe ? 'Still (Safe)' : (enableMpu ? 'High Acceleration' : 'Motion (Ignored)')}
            </Text>
          </View>

          {/* Buzzer Alert */}
          <View style={[styles.sensorCard, { backgroundColor: colors.card, borderColor: colors.hr, opacity: enableBuzzer ? 1 : 0.6 }]}>
            <View style={styles.sensorHeader}>
              <View style={[styles.iconBox, { backgroundColor: enableBuzzer ? colors.watchEsp : colors.dangerBg }]}>
                <IconSymbol name="bell" size={20} color={enableBuzzer ? colors.lightning : colors.subtitle} />
              </View>
              <Text style={[styles.sensorTitle, { color: colors.mainText }]}>Buzzer Alarm</Text>
              <View style={{ flex: 1 }} />
              <Switch 
                value={enableBuzzer} 
                onValueChange={(v) => handleToggle('buzzer', v)} 
                trackColor={{ true: colors.brand, false: colors.hr }} 
                thumbColor={Platform.OS === 'android' ? (enableBuzzer ? colors.brand : '#f4f3f4') : undefined}
              />
            </View>
            <Text style={[styles.sensorState, { color: colors.subtitle }]}>
              {enableBuzzer ? 'Sound Enabled' : 'Silent (Vibration Only)'}
            </Text>
          </View>
        </View>

        <View style={[styles.noteContainer, { backgroundColor: colors.card, borderColor: colors.hr }]}>
          <IconSymbol name="alert-circle-outline" size={20} color={colors.subtitle} style={{ marginRight: 8, marginTop: 2 }} />
          <Text style={[styles.noteText, { color: colors.subtitle }]}>
            Note: You can toggle specific sensors on or off. For example, if you only want to monitor the zipper and light, you can disable the motion sensor to prevent false alarms while walking.
          </Text>
        </View>

      </ScrollView>

      <StopAlarmModal visible={showModal}>
        <View style={[styles.modalIconBox, { backgroundColor: colors.dangerBg }]}>
          <IconSymbol name="shield-alert" size={40} color={colors.locationMarker} />
        </View>
        <Text style={[styles.modalTitle, { color: colors.text, textAlign: 'center' }]}>
          {getStatusText()}
        </Text>
        <Text style={[styles.modalMessage, { color: colors.subtitle, marginTop: 10, textAlign: 'center' }]}>
          We noticed {getStatusText().replace('INTRUSION DETECTED: ', '')} detection at {alertDate ? alertDate.toLocaleTimeString() : ''} near {alertLocationName}. Is this you?
        </Text>

        <Text style={{ fontSize: 32, fontWeight: 'bold', color: colors.locationMarker, textAlign: 'center', marginVertical: 15 }}>
          {countdownSeconds}s
        </Text>
        
        <TouchableOpacity 
          style={[styles.primaryModalButton, { backgroundColor: colors.buttonBackground }]} 
          onPress={handleDismissAlert} 
          activeOpacity={0.8}
        >
          <Text style={[styles.primaryModalButtonText, { color: colors.text }]}>
            Yes, it's me (Stop)
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.secondaryModalButton, { backgroundColor: colors.locationMarker, marginTop: 8 }]} 
          onPress={handleTriggerSos} 
          activeOpacity={0.8}
        >
          <Text style={[styles.secondaryModalButtonText, { color: '#fff' }]}>
            No, Trigger SOS
          </Text>
        </TouchableOpacity>
      </StopAlarmModal>
      
      {/* Toggle Confirmation Modal — styled like the rest of the app */}
      <Modal visible={toggleModalVisible} transparent animationType="fade" onRequestClose={() => { setToggleModalVisible(false); setPendingToggle(null); setDontShowAgainChecked(false); }}>
        <ModalContainer onClose={() => { setToggleModalVisible(false); setPendingToggle(null); setDontShowAgainChecked(false); }}>
          <View style={{ alignItems: 'center', paddingTop: 10 }}>
            {/* Icon */}
            <View style={[styles.toggleIconCircle, { backgroundColor: colors.lightning + '20' }]}>
              <IconSymbol name="shield-alert" size={32} color={colors.lightning} />
            </View>

            <ThemedText type="title" style={{ fontSize: 20, marginBottom: 10, textAlign: 'center' }}>
              Confirm Sensor Change
            </ThemedText>

            <Text style={{ color: colors.subtitle, textAlign: 'center', fontSize: 15, lineHeight: 22, marginBottom: 6, paddingHorizontal: 10 }}>
              Are you sure you want to turn{' '}
              <Text style={{ fontWeight: 'bold', color: colors.text }}>
                {pendingToggle?.sensor === 'reed' ? 'Zipper Sensor' :
                 pendingToggle?.sensor === 'ldr' ? 'Light Sensor' :
                 pendingToggle?.sensor === 'mpu' ? 'Motion Sensor' :
                 pendingToggle?.sensor === 'buzzer' ? 'Buzzer Alarm' : (pendingToggle?.sensor ?? '').toUpperCase()}
              </Text>{' '}
              <Text style={{ fontWeight: 'bold', color: pendingToggle?.value ? colors.lightning : colors.subtitle }}>
                {pendingToggle?.value ? 'ON' : 'OFF'}
              </Text>
              {'?'}
            </Text>

            <Text style={{ color: colors.subtitle, textAlign: 'center', fontSize: 13, lineHeight: 18, marginBottom: 8, paddingHorizontal: 12 }}>
              {pendingToggle?.value 
                ? 'This ensures active intrusion detection all throughout while your device is open and monitoring.' 
                : 'This will ignore alerts for this sensor all throughout while the device is in use.'}
            </Text>

            {/* Don't show again checkbox */}
            <TouchableOpacity
              onPress={() => setDontShowAgainChecked(prev => !prev)}
              style={styles.dontShowRow}
              activeOpacity={0.7}
            >
              <View style={[styles.dontShowCheckbox, { borderColor: colors.brand, backgroundColor: dontShowAgainChecked ? colors.brand : 'transparent' }]}>
                {dontShowAgainChecked && <IconSymbol name="check" size={14} color="#fff" />}
              </View>
              <Text style={{ color: colors.subtitle, fontSize: 14 }}>Don't show this again</Text>
            </TouchableOpacity>

            {/* Buttons */}
            <View style={{ flexDirection: 'row', width: '100%', gap: 12, marginTop: 4 }}>
              <TouchableOpacity
                style={[styles.toggleBtn, { flex: 1, backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.hr }]}
                onPress={() => { setToggleModalVisible(false); setPendingToggle(null); setDontShowAgainChecked(false); }}
              >
                <Text style={{ color: colors.subtitle, fontWeight: '600', fontSize: 15 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, { flex: 1, backgroundColor: colors.brand }]}
                onPress={() => void confirmToggle()}
              >
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ModalContainer>
      </Modal>

      <BleAntiTheftModal
        visible={showPairModal}
        onClose={() => {
          setShowPairModal(false);
          stopScan();
        }}
        devices={devices}
        isScanning={isScanning}
        onConnect={connect}
        onEnableSimulation={enableSimulation}
        isSimulated={isSimulated}
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
    justifyContent: 'space-between',
    paddingHorizontal: 20, 
    paddingTop: 10, 
    paddingBottom: 20,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: { 
    fontSize: 20, 
    fontWeight: '700', 
  },
  content: { 
    flex: 1,
    paddingHorizontal: 20, 
  },
  statusBanner: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 20,
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  statusValue: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center'
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  sensorGrid: {
    marginBottom: 24,
  },
  sensorCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  sensorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  sensorTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  sensorState: {
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 48, 
  },
  noteContainer: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 40,
    alignItems: 'flex-start',
  },
  noteText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
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

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  toggleModalContainer: {
    width: '100%',
    borderRadius: 16,
    padding: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  toggleModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  toggleModalText: {
    fontSize: 16,
    lineHeight: 22,
  },
  toggleModalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 10,
  },
  toggleModalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  toggleIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  dontShowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 20,
    gap: 10,
    alignSelf: 'flex-start',
  },
  dontShowCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleBtn: {
    height: 50,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
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
  bleCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 20,
  },
  bleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  bleIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  bleTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  bleSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  disconnectSmallButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  disconnectSmallButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  primaryBleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
  },
  primaryBleButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  simulationBox: {
    borderTopWidth: 1,
    marginTop: 16,
    paddingTop: 16,
  },
  simulationTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  simulationButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  simTriggerBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginHorizontal: 4,
  },
  simTriggerText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
