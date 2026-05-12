import { StopAlarmModal } from '@/components/alerts/stop-alarm-modal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/color';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, useColorScheme, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AntiTheftMonitorScreen() {
  const router = useRouter();
  const theme = useColorScheme() ?? 'light';
  const colors = Colors[theme as 'light' | 'dark'];

  //true = Safe/Normal, false = triggered/intrusion
  const [reedSafe, setReedSafe] = useState(true);
  const [ldrSafe, setLdrSafe] = useState(true);
  const [mpuSafe, setMpuSafe] = useState(true);
  
  const [isAlerting, setIsAlerting] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    //if those sensor detects an intrusion, trigger the alarm
    if (!reedSafe || !ldrSafe || !mpuSafe) {
      if (!isAlerting) {
        setIsAlerting(true);
        setShowModal(true);
        if (Platform.OS !== 'web') {
          Vibration.vibrate([200, 500, 200, 500], true); 
        }
      }
    } else {
      if (isAlerting) {
        setIsAlerting(false);
        Vibration.cancel();
      }
    }
  }, [reedSafe, ldrSafe, mpuSafe, isAlerting]);

  useEffect(() => {
    return () => Vibration.cancel();
  }, []);

  const getStatusText = () => {
    if (isAlerting) {
      if (!mpuSafe) return 'INTRUSION: Snatch Attempt!';
      if (!ldrSafe) return 'INTRUSION: Bag Slashed!';
      if (!reedSafe) return 'INTRUSION: Zipper Opened!';
      return 'INTRUSION DETECTED';
    }
    return 'System Armed & Safe';
  };

  const getStatusColor = () => {
    if (isAlerting) return colors.locationMarker;
    return colors.lightning;
  };

  const handleDismissAlert = () => {
    setShowModal(false);
    setIsAlerting(false);
    setReedSafe(true);
    setLdrSafe(true);
    setMpuSafe(true);
    Vibration.cancel();
  };

  const handleTriggerSos = () => {
    console.log("SOS Triggered from Anti-Theft!");
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
        
        <View style={[styles.statusBanner, { backgroundColor: isAlerting ? colors.dangerBg : colors.watchEsp, borderColor: isAlerting ? colors.dangerBorder : colors.lightning }]}>
          <IconSymbol 
            name={isAlerting ? "shield-alert" : "shield-check"} 
            size={32} 
            color={getStatusColor()} 
            style={{ marginBottom: 8 }}
          />
          <Text style={[styles.statusLabel, { color: colors.mainText }]}>Status</Text>
          <Text style={[styles.statusValue, { color: getStatusColor() }]}>{getStatusText()}</Text>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.mainText, marginTop: 10 }]}>Live Sensor Data</Text>

        <View style={styles.sensorGrid}>
          {/* Reed Switch */}
          <View style={[styles.sensorCard, { backgroundColor: colors.card, borderColor: !reedSafe ? colors.locationMarker : colors.hr }]}>
            <View style={styles.sensorHeader}>
              <View style={[styles.iconBox, { backgroundColor: !reedSafe ? colors.dangerBg : colors.watchEsp }]}>
                <IconSymbol name="lock-open-variant" size={20} color={!reedSafe ? colors.locationMarker : colors.lightning} />
              </View>
              <Text style={[styles.sensorTitle, { color: colors.mainText }]}>Zipper (Reed)</Text>
            </View>
            <Text style={[styles.sensorState, { color: !reedSafe ? colors.locationMarker : colors.subtitle }]}>
              {reedSafe ? 'Closed (Safe)' : 'Opened'}
            </Text>
          </View>

          {/* LDR */}
          <View style={[styles.sensorCard, { backgroundColor: colors.card, borderColor: !ldrSafe ? colors.locationMarker : colors.hr }]}>
            <View style={styles.sensorHeader}>
              <View style={[styles.iconBox, { backgroundColor: !ldrSafe ? colors.dangerBg : colors.watchEsp }]}>
                <IconSymbol name="weather-sunny" size={20} color={!ldrSafe ? colors.locationMarker : colors.lightning} />
              </View>
              <Text style={[styles.sensorTitle, { color: colors.mainText }]}>Light (LDR)</Text>
            </View>
            <Text style={[styles.sensorState, { color: !ldrSafe ? colors.locationMarker : colors.subtitle }]}>
              {ldrSafe ? 'Dark (Safe)' : 'Light Intrusion'}
            </Text>
          </View>

          {/* MPU6050 */}
          <View style={[styles.sensorCard, { backgroundColor: colors.card, borderColor: !mpuSafe ? colors.locationMarker : colors.hr }]}>
            <View style={styles.sensorHeader}>
              <View style={[styles.iconBox, { backgroundColor: !mpuSafe ? colors.dangerBg : colors.watchEsp }]}>
                <IconSymbol name="run" size={20} color={!mpuSafe ? colors.locationMarker : colors.lightning} />
              </View>
              <Text style={[styles.sensorTitle, { color: colors.mainText }]}>Motion (MPU)</Text>
            </View>
            <Text style={[styles.sensorState, { color: !mpuSafe ? colors.locationMarker : colors.subtitle }]}>
              {mpuSafe ? 'Still (Safe)' : 'High Acceleration'}
            </Text>
          </View>
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
            Trigger Emergency SOS
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
});
