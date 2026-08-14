import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ModalContainer } from '@/components/ui/modal-container';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Colors } from '@/constants/color';
import { useBleContext } from '@/context/ble-context';
import { useMapContext } from '@/context/map-context';
import { parseDistanceToMeters } from '@/utils/alarm-settings';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, TouchableOpacity, useColorScheme, View } from 'react-native';

export default function QuickAlarmConfirmScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { startAlarm, setRegion } = useMapContext();
  const { connectedDevice } = useBleContext();
  const theme = useColorScheme() ?? 'light';
  const colors = Colors[theme as 'light' | 'dark'];
  const [isSyncing, setIsSyncing] = useState(false);

  const { placeName, distance, intensity, duration, lat, lng } = params;

  const handleSetAlarm = async () => {
    const thresholdMeters = parseDistanceToMeters(distance as string);

    if (thresholdMeters === null) {
      Alert.alert('Invalid distance', 'This saved destination has an invalid activation distance.');
      return;
    }

    setIsSyncing(true);
    try {
      await startAlarm(
        placeName as string,
        Number(lat),
        Number(lng),
        thresholdMeters,
        {
          intensity: intensity as string,
          durationSeconds: Number(duration),
        }
      );
    } finally {
      setIsSyncing(false);
    }

    if (lat && lng) {
      setRegion([Number(lng), Number(lat)]);
    }
    router.push({
      pathname: '/(tabs)/alerts'
    });
  };

  return (
    <ModalContainer>
      <View style={styles.content}>
        <View style={[styles.iconCircle, { backgroundColor: colors.modalIcon }]}>
          <IconSymbol name="bell" size={32} color="#ffffff" />
        </View>

        <ThemedText type="title" style={styles.title}>
          Activate Alarm?
        </ThemedText>

        <ThemedText style={[styles.subtitle, { color: colors.subtitle }]}>
          Do you want to set an alarm for{' '}
          <ThemedText style={{fontWeight: 'bold'}}>{placeName}</ThemedText> 
          {' '}using your saved settings?
        </ThemedText>

        {connectedDevice && (
          <View style={[styles.deviceStatus, { backgroundColor: colors.configColor }]}>
            <IconSymbol name="bluetooth" size={16} color="#48bb78" />
            <ThemedText style={styles.deviceStatusText}>
              Connected to {connectedDevice.name}
            </ThemedText>
          </View>
        )}

        <View style={[styles.settingsBox, { backgroundColor: colors.configColor }]}>
          <View style={styles.settingRow}>
            <IconSymbol name="location.fill" size={18} color={colors.activeCard} />
            <ThemedText style={styles.settingText}>
              Distance: {distance}
            </ThemedText>
          </View>
          <View style={styles.settingRow}>
            <IconSymbol name="clock.fill" size={18} color={colors.activeCard} />
            <ThemedText style={styles.settingText}>
              Duration: {duration}s
            </ThemedText>
          </View>
        </View>

        <PrimaryButton 
          style={{ width: '100%', marginTop: 10 }}
          disabled={isSyncing}
          onPress={handleSetAlarm}>
          {isSyncing ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color="#fff" style={{ marginRight: 8 }} />
              <ThemedText style={{ color: '#fff' }}>Syncing...</ThemedText>
            </View>
          ) : (
            'Set Alarm Now'
          )}
        </PrimaryButton>

        <TouchableOpacity onPress={() => router.back()} style={styles.cancelBtn} disabled={isSyncing}>
          <ThemedText style={{ color: colors.subtitle, fontWeight: '600' }}>
            Cancel
          </ThemedText>
        </TouchableOpacity>
      </View>
    </ModalContainer>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: 'center' },
  iconCircle: { width: 70, height: 70, borderRadius: 35, justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  title: { fontSize: 22, marginBottom: 10 },
  subtitle: { textAlign: 'center', marginBottom: 20, paddingHorizontal: 10 },
  deviceStatus: { width: '100%', flexDirection: 'row', alignItems: 'center', borderRadius: 10, padding: 10, marginBottom: 15, gap: 8 },
  deviceStatusText: { fontSize: 13, fontWeight: '500' },
  settingsBox: { width: '100%', borderRadius: 15, padding: 12, marginBottom: 15, gap: 10 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  settingText: { fontSize: 15, fontWeight: '500' },
  cancelBtn: { marginTop: 15 },
});
