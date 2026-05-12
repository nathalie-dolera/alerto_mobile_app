import { StopAlarmModal } from '@/components/alerts/stop-alarm-modal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/color';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, useColorScheme, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
export default function SnoreMonitorScreen() {
  const router = useRouter();
  const theme = useColorScheme() ?? 'light';
  const colors = Colors[theme as 'light' | 'dark'];

  const [hr, setHr] = useState<number | null>(null);
  const [spo2, setSpo2] = useState<number | null>(null);
  const [isAlerting, setIsAlerting] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    //SpO2 drops to 91% (below the safe threshold), AND HR spikes to 90 BPM.
    if (spo2 !== null && hr !== null && spo2 <= 91 && hr >= 90) {
      if (!isAlerting) {
        setIsAlerting(true);
        setShowModal(true);
        if (Platform.OS !== 'web') {
          Vibration.vibrate([500, 1000, 500, 1000], true);
        }
      }
    } else {
      if (isAlerting) {
        setIsAlerting(false);
        Vibration.cancel();
      }
    }
  }, [hr, spo2, isAlerting]);

  useEffect(() => {
    return () => Vibration.cancel();
  }, []);

  const getStatusText = () => {
    if (hr === null || spo2 === null) return 'Waiting for sensor data...';
    if (isAlerting) return 'Apnea Event Detected!';
    return 'Normal Sleep';
  };

  const getStatusColor = () => {
    if (hr === null || spo2 === null) return colors.warningIcon;
    if (isAlerting) return colors.locationMarker;
    return colors.lightning;
  };

  const handleStopAlert = () => {
    setShowModal(false);
    setIsAlerting(false);
    Vibration.cancel();
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <IconSymbol name="chevron.left" size={28} color={colors.icon} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.mainText }]}>
          Snore Detection
        </Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.content}>

        <View style={[styles.statusBanner, { backgroundColor: colors.configColor, borderColor: colors.hr }]}>
          <Text style={[styles.statusLabel, { color: colors.mainText }]}>Current Status</Text>
          <Text style={[styles.statusValue, { color: getStatusColor() }]}>{getStatusText()}</Text>
        </View>

        <View style={styles.metricsContainer}>
          {/* Heart Rate */}
          <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.hr }]}>
            <View style={styles.metricHeader}>
              <View style={[styles.iconBox, { backgroundColor: colors.dangerBg }]}>
                <IconSymbol name="heart" size={24} color={colors.locationMarker} />
              </View>
              <Text style={[styles.metricTitle, { color: colors.subtitle }]}>Heart Rate</Text>
            </View>
            <View style={styles.metricValueContainer}>
              {hr !== null ? (
                <>
                  <Text style={[styles.metricValue, { color: colors.mainText }]}>{hr}</Text>
                  <Text style={[styles.metricUnit, { color: colors.subtitle }]}>BPM</Text>
                </>
              ) : (
                <Text style={[styles.metricValue, { color: colors.subtitle, fontSize: 20 }]}>Not detected</Text>
              )}
            </View>
          </View>

          {/* SpO2 Card */}
          <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.hr }]}>
            <View style={styles.metricHeader}>
              <View style={[styles.iconBox, { backgroundColor: colors.configColor }]}>
                <IconSymbol name="water" size={24} color={colors.infoIcon} />
              </View>
              <Text style={[styles.metricTitle, { color: colors.subtitle }]}>Blood Oxygen</Text>
            </View>
            <View style={styles.metricValueContainer}>
              {spo2 !== null ? (
                <>
                  <Text style={[styles.metricValue, { color: colors.mainText }]}>{spo2}</Text>
                  <Text style={[styles.metricUnit, { color: colors.subtitle }]}>%</Text>
                </>
              ) : (
                <Text style={[styles.metricValue, { color: colors.subtitle, fontSize: 20 }]}>Not detected</Text>
              )}
            </View>
          </View>
        </View>

        <View style={styles.descriptionSection}>
          <Text style={[styles.sectionTitle, { color: colors.mainText }]}>Monitoring Guidelines</Text>

          <View style={[styles.infoCard, { backgroundColor: colors.card, shadowColor: colors.shadow, borderColor: colors.hr }]}>
            <Text style={[styles.infoTitle, { color: colors.mainText }]}>Normal Conditions</Text>
            <ScrollView style={{ maxHeight: 120 }} showsVerticalScrollIndicator={true} nestedScrollEnabled={true}>
              <Text style={[styles.infoText, { color: colors.subtitle }]}>
                • Blood Oxygen (SpO2): Typically between 95% and 100%.
                {"\n"}• Heart Rate (HR): Typically between 60 and 100 BPM while resting.
              </Text>
            </ScrollView>
          </View>

          <View style={[styles.infoCard, { backgroundColor: colors.card, shadowColor: colors.shadow, borderColor: colors.hr }]}>
            <Text style={[styles.infoTitle, { color: colors.mainText }]}>Status Meanings</Text>
            <ScrollView style={{ maxHeight: 180 }} showsVerticalScrollIndicator={true} nestedScrollEnabled={true}>
              <Text style={[styles.infoText, { color: colors.subtitle }]}>
                <Text style={{ fontWeight: '700', color: colors.lightning }}>Normal Sleep:</Text> Your vital signs are within the healthy baseline.
                {"\n\n"}<Text style={{ fontWeight: '700', color: colors.warningIcon }}>Nightmare (HR Spike):</Text> A sudden increase in heart rate without a drop in oxygen. This indicates the airway is open.
                {"\n\n"}<Text style={{ fontWeight: '700', color: colors.locationMarker }}>Apnea Event:</Text> A simultaneous drop in oxygen (SpO2 {'<='} 91%) and spike in heart rate (HR {'>='} 90). The Alerto watch will vibrate.
              </Text>
            </ScrollView>
          </View>
        </View>

      </View>

      <StopAlarmModal visible={showModal}>
        <View style={[styles.modalIconBox, { backgroundColor: colors.dangerBg }]}>
          <IconSymbol name="alert-circle" size={40} color={colors.locationMarker} />
        </View>
        <Text style={[styles.modalTitle, { color: colors.text }]}>
          Apnea Event Detected
        </Text>
        <Text style={[styles.modalMessage, { color: colors.subtitle }]}>
          Your oxygen levels have dropped and heart rate spiked. Please change your sleeping position!
        </Text>

        <TouchableOpacity
          style={[styles.primaryModalButton, { backgroundColor: colors.locationMarker }]}
          onPress={handleStopAlert}
          activeOpacity={0.8}
        >
          <Text style={[styles.primaryModalButtonText, { color: colors.activeText }]}>
            I&apos;m Awake / Dismiss
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
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 24,
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  statusValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  metricsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 32,
  },
  metricCard: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginHorizontal: 4,
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  metricTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  metricValueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  metricValue: {
    fontSize: 48,
    fontWeight: '700',
  },
  metricUnit: {
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 4,
  },
  descriptionSection: {
    flex: 1,
    marginTop: 10,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  infoCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    lineHeight: 22,
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
});
