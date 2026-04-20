import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ModalContainer } from '@/components/ui/modal-container';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Colors } from '@/constants/color';
import { useMapContext } from '@/context/map-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, TouchableOpacity, useColorScheme, View } from 'react-native';

export default function QuickAlarmConfirmScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { startAlarm, setRegion } = useMapContext();
  const theme = useColorScheme() ?? 'light';
  const colors = Colors[theme as 'light' | 'dark'];

  const { placeName, distance, intensity, duration, lat, lng } = params;

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

        <View style={[styles.settingsBox, { backgroundColor: colors.configColor }]}>
            <View style={styles.settingRow}>
                <IconSymbol name="location.fill" size={18} color={colors.activeCard} />
                <ThemedText style={styles.settingText}>
                    Distance: {distance}
                </ThemedText>

            </View>
            <View style={styles.settingRow}>
                <IconSymbol name="vibrate" size={18} color={colors.activeCard} />
                <ThemedText style={styles.settingText}>
                    Intensity: {intensity}
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
            onPress={() => {
                const thresholdMeters = (distance as string).includes('km') 
                    ? parseFloat(distance as string) * 1000 
                    : parseFloat(distance as string);

                startAlarm(placeName as string, Number(lat), Number(lng), thresholdMeters);
                if (lat && lng) {
                    setRegion([Number(lng), Number(lat)]);
                }
                router.push({
                    pathname: '/(tabs)/alerts'
                });
            }}>
            Set Alarm Now
        </PrimaryButton>

        <TouchableOpacity onPress={() => router.back()} style={styles.cancelBtn}>
            <ThemedText style={{ color: colors.subtitle, fontWeight: '600' }}>
            Cancel
            </ThemedText>
        </TouchableOpacity>
      </View>
    </ModalContainer>
  );
}

const styles = StyleSheet.create({
    content: { 
        alignItems: 'center' 
    },
    iconCircle: {
        width: 70, 
        height: 70, 
        borderRadius: 35,
        justifyContent: 'center', 
        alignItems: 'center',
         marginBottom: 15,
    },
    title: { 
        fontSize: 22, 
        marginBottom: 10 
    },
    subtitle: { 
        textAlign: 'center', 
        marginBottom: 20, 
        paddingHorizontal: 10 
    },
    settingsBox: {
        width: '100%', 
        borderRadius: 15,
        padding: 12, 
        marginBottom: 15, 
        gap: 10
    },
    settingRow: { 
        flexDirection: 'row', 
        alignItems: 'center', 
        gap: 10 
    },
    settingText: { 
        fontSize: 15, 
        fontWeight: '500' 
    },
    cancelBtn: { 
        marginTop: 15 
    },
});