import { StopAlarmModal } from '@/components/alerts/stop-alarm-modal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/color';
import { useAuth } from '@/context/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EmergencyService } from '@/services/emergency-service';
import { MonitoringAnalyticsService } from '@/services/monitoring-analytics';
import { SmsService } from '@/services/sms-service';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, useColorScheme, Vibration, View, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAntiTheftBle } from '@/context/anti-theft-ble-context';
import { BleAntiTheftModal } from '@/components/ui/ble-anti-theft-modal';

const ANTI_THEFT_SMS_TIMEOUT_MS = 2 * 60 * 1000;
type AntiTheftSmsSource = 'timeout' | 'manual';

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
    isAlerting,
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
  const antiTheftSmsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const antiTheftSmsSentRef = useRef(false);

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
        ? `${reason} - no shake or phone dismissal within 2 minutes`
        : `${reason} - emergency alert triggered from the phone`,
    });

    let sentCount = 0;
    for (const contact of contacts) {
      const result = await SmsService.sendSms(contact.phoneNumber, message);
      if (result.success) sentCount += 1;
    }

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
    if (isAlerting) {
      setShowModal(true);
      void MonitoringAnalyticsService.recordAntiTheftEvent(user?.id);
      if (Platform.OS !== 'web') {
        Vibration.vibrate([200, 500, 200, 500], true); 
      }
    } else {
      setShowModal(false);
      Vibration.cancel();
    }
  }, [isAlerting, user?.id]);

  useEffect(() => {
    return () => Vibration.cancel();
  }, []);

  const getStatusText = () => {
    if (isAlerting) {
      if (enableMpu && !mpuSafe) return 'INTRUSION: Snatch Attempt!';
      if (enableLdr && !ldrSafe) return 'INTRUSION: Bag Slashed!';
      if (enableReed && !reedSafe) return 'INTRUSION: Zipper Opened!';
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
        return 'System Armed & Safe';
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

  const handleDismissAlert = () => {
    clearAntiTheftSmsTimer();
    dismissAlarm();
    setShowModal(false);
    Vibration.cancel();
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
              onPress={() => void disarmSystem()}
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
                onValueChange={setEnableReed} 
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
                onValueChange={setEnableLdr} 
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
                onValueChange={setEnableMpu} 
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
                onValueChange={setEnableBuzzer} 
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
        <Text style={[styles.modalMessage, { color: colors.subtitle }]}>
          Your bag tag detected an intrusion attempt. Please check your belongings immediately!
        </Text>
        
        <TouchableOpacity 
          style={[styles.primaryModalButton, { backgroundColor: colors.locationMarker }]} 
          onPress={handleTriggerSos} 
          activeOpacity={0.8}
        >
          <Text style={[styles.primaryModalButtonText, { color: colors.activeText }]}>
            Trigger Emergency Alert
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.secondaryModalButton, { backgroundColor: colors.buttonBackground, marginTop: 8 }]} 
          onPress={handleDismissAlert} 
          activeOpacity={0.8}
        >
          <Text style={[styles.secondaryModalButtonText, { color: colors.mainText }]}>
            Dismiss Alarm (False Alarm)
          </Text>
        </TouchableOpacity>
      </StopAlarmModal>

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
