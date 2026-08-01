import { Colors } from '@/constants/color';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useMapContext } from '@/context/map-context';
import { useAntiTheftBle } from '@/context/anti-theft-ble-context';

export default function AlertsScreen() {
  const theme = useColorScheme() ?? 'light';
  const colors = Colors[theme as 'light' | 'dark'];
  const router = useRouter();
  const { isAlarmActive } = useMapContext();
  const { connectionStatus } = useAntiTheftBle();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.mainText }]}>
          Alerts
        </Text>
      </View>

      <View style={styles.content}>

        <TouchableOpacity 
          style={[styles.monitorCard, { backgroundColor: colors.card, borderColor: isAlarmActive ? colors.lightning : colors.hr }]} 
          onPress={() => router.push('/(main)/commute-monitor')}
          activeOpacity={0.8}
        >
          <View style={[styles.iconBox, { backgroundColor: isAlarmActive ? colors.primaryIcon : colors.buttonBackground }]}>
            <IconSymbol name="map" size={24} color={isAlarmActive ? '#fff' : colors.icon} />
          </View>
          
          <View style={styles.cardTextContent}>
            <Text style={[styles.cardTitle, { color: colors.mainText }]}>
              Commute Monitor
            </Text>
            <View style={styles.statusRow}>
              <View style={[styles.statusIndicator, { backgroundColor: isAlarmActive ? colors.lightning : colors.icon }]} />
              <Text style={[styles.cardSubtitle, { color: isAlarmActive ? colors.lightning : colors.subtitle }]}>
                {isAlarmActive ? 'Active - Tracking route' : 'Inactive'}
              </Text>
            </View>
          </View>
          
          <IconSymbol name="chevron.right" size={20} color={colors.icon} />
        </TouchableOpacity>




        <TouchableOpacity 
          style={[styles.monitorCard, { backgroundColor: colors.card, borderColor: colors.hr }]} 
          onPress={() => router.push('/(main)/anti-theft-monitor')}
          activeOpacity={0.8}
        >
          <View style={[styles.iconBox, { backgroundColor: colors.buttonBackground }]}>
            <IconSymbol name="shield-alert" size={24} color={colors.icon} />
          </View>
          
          <View style={styles.cardTextContent}>
            <Text style={[styles.cardTitle, { color: colors.mainText }]}>
              Anti-Theft Tracking
            </Text>
            <View style={styles.statusRow}>
              <View style={[styles.statusIndicator, { backgroundColor: connectionStatus === 'disconnected' ? colors.icon : colors.brand }]} />
              <Text style={[styles.cardSubtitle, { color: connectionStatus === 'disconnected' ? colors.subtitle : colors.brand }]}>
                {connectionStatus === 'disconnected' ? 'Disconnected' : 'Connected'}
              </Text>
            </View>
          </View>
          
          <IconSymbol name="chevron.right" size={20} color={colors.icon} />
        </TouchableOpacity>
      </View>
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
  },
  headerTitle: { 
    fontSize: 20, 
    fontWeight: '700', 
  },
  content: { 
    flex: 1,
    paddingHorizontal: 20, 
    paddingTop: 10,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1.2,
    marginBottom: 10,
    marginLeft: 4
  },
  monitorCard: {
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: 16,
    borderRadius: 16, 
    borderWidth: 1,
    marginBottom: 16,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  cardTextContent: {
    flex: 1,
  },
  cardTitle: { 
    fontSize: 16, 
    fontWeight: '700',
    marginBottom: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  cardSubtitle: {
    fontSize: 13,
    fontWeight: '500',
  },
});
