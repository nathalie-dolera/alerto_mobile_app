import { DestinationCard } from '@/components/dashboard/destination-card';
import { StatusCard } from '@/components/dashboard/status-card';
import { ThemedText } from '@/components/themed-text';
import { BleDeviceModal } from '@/components/ui/ble-device-modal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/color';
import { useAuth } from '@/context/auth';
import { useBleContext } from '@/context/ble-context';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function DriverDashboard() {
  const theme = useColorScheme() ?? 'light';
  const colors = Colors[theme as 'light' | 'dark'];
  const router = useRouter();
  const { user } = useAuth();
  const { connectedDevice, isScanning, devices, startScan, stopScan, connect, disconnect } = useBleContext();
  const [isBleModalVisible, setIsBleModalVisible] = useState(false);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>

        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.mainText }]}>
            Driver Dashboard
          </Text>

          <TouchableOpacity
            onPress={() => router.push('/(driver)/settings')}
            style={[styles.profileCircle, { backgroundColor: colors.avatarBg }]}
            activeOpacity={0.8}
          >
            {user?.image ? (
              <Image source={{ uri: user.image }} style={styles.profileImage} />
            ) : (
              <IconSymbol name="person.fill" size={24} color={colors.profileIcon} />
            )}
          </TouchableOpacity>
        </View>

        <DestinationCard
          onPress={() => router.push('/(main)/driver-monitor')}
          style={{
            backgroundColor: theme === 'light' ? '#FFE8E8' : colors.dangerBg,
            marginBottom: 20,
            paddingVertical: 12,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <View>
              <Text style={[styles.cardLabel, { color: colors.mainText, opacity: 0.6 }]}>
                Driver Safety
              </Text>
              <Text style={[styles.cardTitle, { color: colors.mainText, marginTop: 2 }]}>
                Track Drowsiness
              </Text>
            </View>
            <View style={[styles.searchCircle, { backgroundColor: theme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)' }]}>
              <IconSymbol name='eye' size={24} color={colors.mainText} />
            </View>
          </View>
        </DestinationCard>

        <DestinationCard
          onPress={() => router.push('/map-select')}
          style={{
            backgroundColor: theme === 'light' ? '#FFF3E8' : 'rgba(234, 179, 8, 0.15)',
            marginBottom: 20,
            paddingVertical: 12,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <View>
              <Text style={[styles.cardLabel, { color: colors.mainText, opacity: 0.6 }]}>
                Area Safety
              </Text>
              <Text style={[styles.cardTitle, { color: colors.mainText, marginTop: 2 }]}>
                Risk Heatmap
              </Text>
            </View>
            <View style={[styles.searchCircle, { backgroundColor: theme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)' }]}>
              <IconSymbol name='map' size={24} color={colors.mainText} />
            </View>
          </View>
        </DestinationCard>

        <DestinationCard
          onPress={() => router.push('/(main)/emergency-contacts')}
          style={{
            backgroundColor: theme === 'light' ? '#E8EFFF' : colors.buttonBackground,
            marginBottom: 20,
            paddingVertical: 12,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <View>
              <Text style={[styles.cardLabel, { color: colors.mainText, opacity: 0.6 }]}>
                Contacts
              </Text>
              <Text style={[styles.cardTitle, { color: colors.mainText, marginTop: 2 }]}>
                Emergency Contacts
              </Text>
            </View>
            <View style={[styles.searchCircle, { backgroundColor: theme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.1)' }]}>
              <IconSymbol name='people-sharp' size={24} color={colors.mainText} />
            </View>
          </View>
        </DestinationCard>

        <View style={styles.statusSection}>
          <ThemedText
            style={[styles.statusHeader, { color: colors.mainText }]}>
            Wearable Status
          </ThemedText>

          <ThemedText
            style={[styles.statusSub, { color: colors.subtitle }]}>
            Tap to connect to your wearable device
          </ThemedText>

          <StatusCard onPress={() => {
            if (connectedDevice) {
              disconnect();
            } else {
              setIsBleModalVisible(true);
              startScan();
            }
          }}>
            <View style={[styles.bluetoothCircle, { backgroundColor: connectedDevice ? '#48bb78' : '#3b4fb0' }]}>
              <IconSymbol name={connectedDevice ? "bluetooth" : "bluetooth"} size={20} color="#fff" />
            </View>

            <View>
              <ThemedText
                style={styles.statusTitle}>
                {connectedDevice ? 'CONNECTED' : 'DISCONNECTED'}
              </ThemedText>
              <ThemedText
                style={styles.batteryText}>
                {connectedDevice ? 'Wearable is active' : 'Tap to connect'}
              </ThemedText>
            </View>
          </StatusCard>
        </View>

        <BleDeviceModal
          visible={isBleModalVisible}
          onClose={() => {
            setIsBleModalVisible(false);
            stopScan();
          }}
          devices={devices}
          isScanning={isScanning}
          onConnect={async (device) => {
            try {
              await connect(device);
              setIsBleModalVisible(false);
              stopScan();
            } catch (error) {
              console.error('Failed to connect:', error);
            }
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 24,
    paddingTop: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  profileCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  profileImage: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  searchCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusSection: {
    marginTop: 15,
  },
  statusHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#091432',
  },
  statusSub: {
    fontSize: 12,
    marginBottom: 12,
  },
  bluetoothCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3b4fb0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  statusTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  batteryText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginTop: 2,
  },
});
