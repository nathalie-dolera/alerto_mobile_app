import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/color';
import { useBleContext } from '@/context/ble-context';
import { PHILIPPINES_CAMERA_BOUNDS } from '@/utils/philippines';
import MapLibreGL from '@maplibre/maplibre-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Clipboard,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

MapLibreGL.setAccessToken(null);

const BASE_MAP = 'https://tiles.openfreemap.org/styles/liberty';
const DARK_MAP = 'https://tiles.openfreemap.org/styles/dark';
const LAST_LOC_KEY = 'alerto_device_last_known_location';

interface LastLocation {
  lat: number;
  lng: number;
  sats: number;
  timestamp: number;
  source: 'hardware' | 'unknown';
}

export default function DeviceTrackerScreen() {
  const router = useRouter();
  const theme = (useColorScheme() ?? 'light') as 'light' | 'dark';
  const colors = Colors[theme];
  const mapStyle = theme === 'dark' ? DARK_MAP : BASE_MAP;

  const { connectedDevice, sensorData } = useBleContext();

  const [lastLocation, setLastLocation] = useState<LastLocation | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isUserPanning, setIsUserPanning] = useState(false);
  const mapRef = useRef<any>(null);

  // Load persisted last known location on mount
  useEffect(() => {
    const loadSaved = async () => {
      try {
        const raw = await AsyncStorage.getItem(LAST_LOC_KEY);
        if (raw) {
          const parsed: LastLocation = JSON.parse(raw);
          setLastLocation(parsed);
        }
      } catch (_) {}
    };
    loadSaved();
  }, []);

  // Track device connection
  useEffect(() => {
    setIsConnected(!!connectedDevice);
  }, [connectedDevice]);

  // Update location whenever sensorData has a valid GPS fix
  useEffect(() => {
    if (
      sensorData?.latitude &&
      sensorData?.longitude &&
      sensorData.latitude !== 0 &&
      sensorData.longitude !== 0
    ) {
      const loc: LastLocation = {
        lat: sensorData.latitude,
        lng: sensorData.longitude,
        sats: (sensorData as any).sats ?? 0,
        timestamp: Date.now(),
        source: 'hardware',
      };
      setLastLocation(loc);
      // Persist to AsyncStorage so it's available after BLE disconnects
      void AsyncStorage.setItem(LAST_LOC_KEY, JSON.stringify(loc));
    }
  }, [sensorData?.latitude, sensorData?.longitude]);

  const mapCenter: [number, number] = lastLocation
    ? [lastLocation.lng, lastLocation.lat]
    : [120.9842, 14.5995]; // Manila fallback

  const hasLocation = !!lastLocation;
  const isLive = isConnected && hasLocation;

  const coordString = lastLocation
    ? `${lastLocation.lat.toFixed(6)}, ${lastLocation.lng.toFixed(6)}`
    : 'No location yet';

  const lastUpdatedText = lastLocation
    ? formatTimeAgo(lastLocation.timestamp)
    : '—';

  const handleCopy = () => {
    if (!hasLocation) return;
    Clipboard.setString(coordString);
    Alert.alert('Copied!', 'Coordinates copied to clipboard.');
  };

  const handleOpenMaps = () => {
    if (!lastLocation) return;
    const url = `https://maps.google.com/?q=${lastLocation.lat},${lastLocation.lng}`;
    void Linking.openURL(url);
  };

  // Dynamic status indicator
  let statusLabel = 'Not Connected';
  let statusColor = '#ef4444';
  let statusDot = '🔴';

  if (isConnected && !hasLocation) {
    statusLabel = 'Connected — No GPS Fix';
    statusColor = '#f59e0b';
    statusDot = '🟡';
  } else if (isConnected && hasLocation) {
    statusLabel = `Live — ${lastLocation?.sats ?? 0} Satellites`;
    statusColor = '#22c55e';
    statusDot = '🟢';
  } else if (!isConnected && hasLocation) {
    statusLabel = 'Offline — Last Known Location';
    statusColor = '#f97316';
    statusDot = '🟠';
  }

  return (
    <SafeAreaView style={[s.safeArea, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.card, borderBottomColor: colors.hr }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} id="tracker-back-btn">
          <IconSymbol name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={s.headerTitle}>
          <IconSymbol name="locate-sharp" size={20} color="#3b82f6" />
          <Text style={[s.headerText, { color: colors.text }]}>Device Tracker</Text>
        </View>
        <View style={s.headerRight}>
          <View style={[s.statusDot, { backgroundColor: statusColor }]} />
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>
        {/* Status Banner */}
        <View style={[s.statusBanner, { backgroundColor: colors.card, borderColor: statusColor }]}>
          <Text style={s.statusEmoji}>{statusDot}</Text>
          <View style={s.statusTextWrap}>
            <Text style={[s.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
            {hasLocation && (
              <Text style={[s.statusSub, { color: colors.subtitle }]}>
                Last updated {lastUpdatedText}
              </Text>
            )}
          </View>
        </View>

        {/* Map */}
        <View style={[s.mapWrapper, { borderColor: colors.hr }]}>
          <MapLibreGL.MapView
            ref={mapRef}
            style={StyleSheet.absoluteFillObject}
            mapStyle={mapStyle}
            logoEnabled={false}
            surfaceView={Platform.OS === 'android'}
            scrollEnabled
            zoomEnabled
            rotateEnabled={false}
            onRegionWillChange={(f: any) => {
              if (f?.properties?.isGesture) setIsUserPanning(true);
            }}
            onPress={() => setIsUserPanning(false)}
          >
            <MapLibreGL.Camera
              zoomLevel={15}
              centerCoordinate={isUserPanning ? undefined : mapCenter}
              animationMode="linearTo"
              animationDuration={800}
              maxBounds={PHILIPPINES_CAMERA_BOUNDS}
            />
            {hasLocation && (
              <MapLibreGL.PointAnnotation
                id="device-pin"
                coordinate={mapCenter}
                anchor={{ x: 0.5, y: 1 }}
              >
                <View style={s.pinWrap} collapsable={false}>
                  <View style={[s.pinPulse, { borderColor: isLive ? '#22c55e' : '#f97316' }]} />
                  <IconSymbol
                    name="locate-sharp"
                    size={36}
                    color={isLive ? '#22c55e' : '#f97316'}
                  />
                </View>
              </MapLibreGL.PointAnnotation>
            )}
          </MapLibreGL.MapView>

          {/* Map overlay label */}
          <View style={[s.mapLabel, { backgroundColor: colors.card + 'E0' }]}>
            <Text style={[s.mapLabelText, { color: colors.text }]}>
              {isLive ? '📡 Live GPS' : hasLocation ? '📍 Last Known' : '📡 Searching...'}
            </Text>
          </View>
        </View>

        {/* Coordinates Card */}
        <View style={[s.coordCard, { backgroundColor: colors.card, borderColor: colors.hr }]}>
          <View style={s.coordRow}>
            <IconSymbol name="location-outline" size={18} color="#3b82f6" />
            <Text style={[s.coordLabel, { color: colors.subtitle }]}>Coordinates</Text>
          </View>
          <Text
            style={[s.coordValue, { color: hasLocation ? colors.text : colors.subtitle }]}
            id="tracker-coords-text"
          >
            {coordString}
          </Text>
          <View style={s.coordActions}>
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: '#3b82f620', borderColor: '#3b82f6' }]}
              onPress={handleCopy}
              disabled={!hasLocation}
              id="tracker-copy-btn"
            >
              <IconSymbol name="copy-outline" size={15} color="#3b82f6" />
              <Text style={[s.actionBtnText, { color: '#3b82f6' }]}>Copy</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.actionBtn, { backgroundColor: '#22c55e20', borderColor: '#22c55e' }]}
              onPress={handleOpenMaps}
              disabled={!hasLocation}
              id="tracker-maps-btn"
            >
              <IconSymbol name="map-outline" size={15} color="#22c55e" />
              <Text style={[s.actionBtnText, { color: '#22c55e' }]}>Open in Maps</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Info Cards */}
        <View style={s.infoRow}>
          <InfoCard
            label="GPS Source"
            value={isConnected ? 'Hardware GPS' : 'Last Sync'}
            icon="satellite-outline"
            color="#8b5cf6"
            colors={colors}
          />
          <InfoCard
            label="Satellites"
            value={lastLocation?.sats != null ? `${lastLocation.sats} sats` : '—'}
            icon="wifi-outline"
            color="#0ea5e9"
            colors={colors}
          />
        </View>
        <View style={s.infoRow}>
          <InfoCard
            label="Bluetooth"
            value={isConnected ? 'Connected' : 'Disconnected'}
            icon={isConnected ? 'bluetooth' : 'bluetooth-outline'}
            color={isConnected ? '#22c55e' : '#ef4444'}
            colors={colors}
          />
          <InfoCard
            label="Last Updated"
            value={hasLocation ? lastUpdatedText : 'Never'}
            icon="time-outline"
            color="#f59e0b"
            colors={colors}
          />
        </View>

        {/* Transparency note */}
        {!isConnected && hasLocation && (
          <View style={[s.notice, { backgroundColor: '#f97316' + '20', borderColor: '#f97316' }]}>
            <IconSymbol name="information-circle-outline" size={18} color="#f97316" />
            <Text style={[s.noticeText, { color: '#f97316' }]}>
              Bluetooth is disconnected. Showing last known GPS location. Connect to get a live position.
            </Text>
          </View>
        )}
        {!hasLocation && (
          <View style={[s.notice, { backgroundColor: '#6b7280' + '20', borderColor: '#6b7280' }]}>
            <IconSymbol name="locate-outline" size={18} color="#6b7280" />
            <Text style={[s.noticeText, { color: '#6b7280' }]}>
              Connect to the wearable and wait for a GPS fix to see the device location here.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Helper Components ──────────────────────────────────────────────────────

function InfoCard({
  label,
  value,
  icon,
  color,
  colors,
}: {
  label: string;
  value: string;
  icon: string;
  color: string;
  colors: any;
}) {
  return (
    <View style={[s.infoCard, { backgroundColor: colors.card, borderColor: colors.hr, flex: 1 }]}>
      <View style={[s.infoIconWrap, { backgroundColor: color + '20' }]}>
        <IconSymbol name={icon as any} size={18} color={color} />
      </View>
      <Text style={[s.infoLabel, { color: colors.subtitle }]}>{label}</Text>
      <Text style={[s.infoValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

function formatTimeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 10) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 6, marginRight: 4 },
  headerTitle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerText: { fontSize: 17, fontWeight: '700' },
  headerRight: { width: 36, alignItems: 'flex-end' },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 14, paddingBottom: 40 },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  statusEmoji: { fontSize: 24 },
  statusTextWrap: { flex: 1 },
  statusLabel: { fontSize: 15, fontWeight: '700' },
  statusSub: { fontSize: 12, marginTop: 2 },
  mapWrapper: {
    height: 280,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
  },
  mapLabel: {
    position: 'absolute',
    top: 10,
    right: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  mapLabelText: { fontSize: 12, fontWeight: '600' },
  pinWrap: { alignItems: 'center', justifyContent: 'center' },
  pinPulse: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    opacity: 0.3,
  },
  coordCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  coordRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  coordLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  coordValue: { fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  coordActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  actionBtnText: { fontSize: 13, fontWeight: '600' },
  infoRow: { flexDirection: 'row', gap: 12 },
  infoCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
    alignItems: 'flex-start',
  },
  infoIconWrap: { padding: 7, borderRadius: 10 },
  infoLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  infoValue: { fontSize: 14, fontWeight: '700' },
  notice: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'flex-start',
  },
  noticeText: { flex: 1, fontSize: 13, fontWeight: '500', lineHeight: 18 },
});
