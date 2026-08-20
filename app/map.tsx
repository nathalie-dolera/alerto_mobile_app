import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors } from "@/constants/color";
import MapLibreGL from '@maplibre/maplibre-react-native';
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, TouchableOpacity, View, useColorScheme } from 'react-native';
import * as Location from 'expo-location';

const STADIA_KEY = process.env.EXPO_PUBLIC_STADIA_API_KEY;
const BASE_MAP_URL = STADIA_KEY
  ? `https://tiles.stadiamaps.com/styles/osm_bright.json?api_key=${STADIA_KEY}`
  : 'https://tiles.stadiamaps.com/styles/osm_bright.json';
const DARK_MAP_URL = STADIA_KEY
  ? `https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json?api_key=${STADIA_KEY}`
  : 'https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json';

MapLibreGL.setAccessToken(null);

export default function EmergencyMapScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ lat?: string; lng?: string; name?: string }>();
  const theme = useColorScheme() ?? 'light';
  const colors = Colors[theme as 'light' | 'dark'];

  const lat = params.lat ? parseFloat(params.lat) : 14.5995;
  const lng = params.lng ? parseFloat(params.lng) : 120.9842;
  const [addressName, setAddressName] = useState<string>(params.name || "Emergency Location");

  useEffect(() => {
    (async () => {
      try {
        const addresses = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        if (addresses && addresses.length > 0) {
          const a = addresses[0];
          const fullAddress = [a.name, a.street, a.city || a.region].filter(Boolean).join(", ");
          if (fullAddress) setAddressName(fullAddress);
        }
      } catch {
        // Fallback to coordinates
      }
    })();
  }, [lat, lng]);

  const openInExternalMaps = () => {
    const url = Platform.select({
      ios: `maps:0,0?q=${lat},${lng}`,
      android: `geo:0,0?q=${lat},${lng}(Emergency+Location)`,
      default: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
    });
    if (url) void Linking.openURL(url);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <IconSymbol name="chevron.left" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Emergency Location
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.mapContainer}>
        <MapLibreGL.MapView
          style={styles.map}
          mapStyle={theme === 'dark' ? DARK_MAP_URL : BASE_MAP_URL}
          logoEnabled={false}
          attributionEnabled={false}
        >
          <MapLibreGL.Camera
            centerCoordinate={[lng, lat]}
            zoomLevel={15}
            animationMode="flyTo"
          />

          <MapLibreGL.PointAnnotation id="emergency-marker" coordinate={[lng, lat]}>
            <View style={styles.markerContainer}>
              <View style={[styles.markerPin, { backgroundColor: colors.dangerIcon }]}>
                <IconSymbol name="shield-alert" size={20} color="#fff" />
              </View>
              <View style={[styles.markerTriangle, { borderTopColor: colors.dangerIcon }]} />
            </View>
          </MapLibreGL.PointAnnotation>
        </MapLibreGL.MapView>
      </View>

      <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.hr }]}>
        <View style={styles.infoRow}>
          <View style={[styles.iconCircle, { backgroundColor: colors.dangerIcon + '20' }]}>
            <IconSymbol name="map-marker" size={24} color={colors.dangerIcon} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.infoTitle, { color: colors.text }]}>{addressName}</Text>
            <Text style={[styles.infoSubtitle, { color: colors.subtitle }]}>
              Lat: {lat.toFixed(5)}, Lng: {lng.toFixed(5)}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.directionsBtn, { backgroundColor: colors.activeCard }]}
          onPress={openInExternalMaps}
          activeOpacity={0.8}
        >
          <IconSymbol name="locate" size={18} color={colors.activeText} />
          <Text style={[styles.directionsBtnText, { color: colors.activeText }]}>
            Open Navigation
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 12,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  mapContainer: { flex: 1 },
  map: { flex: 1 },
  markerContainer: { alignItems: 'center', justifyContent: 'center' },
  markerPin: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  markerTriangle: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
  },
  infoCard: {
    padding: 20,
    borderTopWidth: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  infoSubtitle: { fontSize: 13 },
  directionsBtn: {
    flexDirection: 'row',
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  directionsBtnText: { fontSize: 15, fontWeight: 'bold' },
});
