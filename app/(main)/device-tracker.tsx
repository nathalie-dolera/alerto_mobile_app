import { BleDeviceModal } from '@/components/ui/ble-device-modal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/color';
import { useBleContext } from '@/context/ble-context';
import { PHILIPPINES_CAMERA_BOUNDS } from '@/utils/philippines';
import MapLibreGL from '@maplibre/maplibre-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Clipboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

MapLibreGL.setAccessToken(null);

const BASE_MAP = 'https://tiles.openfreemap.org/styles/liberty';
const DARK_MAP = 'https://tiles.openfreemap.org/styles/dark';
const LAST_LOC_KEY = 'alerto_device_last_known_location';
const SMS_LOAD_KEY = 'alerto_sms_load_config_v3';
const SMS_FORMAT_KEY = 'alerto_sms_format_mode_v3';

export type SmsLoadType = 'regular' | 'promo' | null;
export type SmsFormatType = 'coords_only' | 'combined' | 'separate';

export interface SmsLoadConfig {
  loadType: 'regular' | 'promo';
  // Regular load
  regularAmount?: number; // e.g. 50 (PHP) -> 50 SMS
  // Promo load
  promoIsUnli?: boolean; // true if Unlimited SMS
  promoTotalSms?: number; // e.g. 100
  promoValidityDays?: number; // e.g. 30
  startDate: string; // ISO date string
  expirationDate: string; // ISO date string
  // Hardware sync baseline
  baselineSmsSent: number;
}

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

  const {
    connectedDevice,
    sensorData,
    isScanning,
    devices,
    startScan,
    stopScan,
    connect,
    sendSmsFormat,
  } = useBleContext();

  const [lastLocation, setLastLocation] = useState<LastLocation | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isUserPanning, setIsUserPanning] = useState(false);
  const [isBleModalVisible, setIsBleModalVisible] = useState(false);
  const [isLoadModalVisible, setIsLoadModalVisible] = useState(false);

  // SMS Load & Format State (Default loadConfig is null -> N/A)
  const [loadConfig, setLoadConfig] = useState<SmsLoadConfig | null>(null);
  const [smsFormat, setSmsFormat] = useState<SmsFormatType>('coords_only');
  const [hasShownExpiryAlert, setHasShownExpiryAlert] = useState(false);
  const mapRef = useRef<any>(null);

  // Load persisted location, SMS load config, and format preferences on mount
  useEffect(() => {
    const loadSavedData = async () => {
      try {
        const [rawLoc, rawLoad, rawFormat] = await Promise.all([
          AsyncStorage.getItem(LAST_LOC_KEY),
          AsyncStorage.getItem(SMS_LOAD_KEY),
          AsyncStorage.getItem(SMS_FORMAT_KEY),
        ]);

        if (rawLoc) {
          const parsedLoc: LastLocation = JSON.parse(rawLoc);
          setLastLocation(parsedLoc);
        }

        if (rawLoad) {
          const parsedLoad: SmsLoadConfig = JSON.parse(rawLoad);
          setLoadConfig(parsedLoad);
        }

        if (rawFormat && (rawFormat === 'coords_only' || rawFormat === 'combined' || rawFormat === 'separate')) {
          setSmsFormat(rawFormat as SmsFormatType);
        }
      } catch (err) {
        console.error('Error loading saved tracker settings:', err);
      }
    };
    loadSavedData();
  }, []);

  // Track device connection and sync format
  useEffect(() => {
    setIsConnected(!!connectedDevice);
    if (connectedDevice) {
      void sendSmsFormat(smsFormat);
    }
  }, [connectedDevice, sendSmsFormat, smsFormat]);

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
        sats: sensorData.sats ?? 0,
        timestamp: Date.now(),
        source: 'hardware',
      };
      setLastLocation(loc);
      void AsyncStorage.setItem(LAST_LOC_KEY, JSON.stringify(loc));
    }
  }, [sensorData?.latitude, sensorData?.longitude, sensorData?.sats]);

  const mapCenter: [number, number] = lastLocation
    ? [lastLocation.lng, lastLocation.lat]
    : [120.9842, 14.5995]; // Manila fallback

  const hasLocation = !!lastLocation;
  const isLive = isConnected && hasLocation;

  const coordString = lastLocation
    ? `${lastLocation.lat.toFixed(6)}, ${lastLocation.lng.toFixed(6)}`
    : 'No location yet';

  const handleCopy = () => {
    if (!lastLocation) return;
    const textToCopy = `${lastLocation.lat.toFixed(6)}, ${lastLocation.lng.toFixed(6)}`;
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(textToCopy);
    } else {
      Clipboard.setString(textToCopy);
    }
    Alert.alert('Copied!', 'Coordinates copied to clipboard.');
  };

  const handleOpenMaps = () => {
    if (!lastLocation) return;
    const { lat, lng } = lastLocation;
    const alertoWebUrl = `https://alerto-web-system.vercel.app/map?lat=${lat}&lng=${lng}`;

    // If running in a standalone web browser environment without native app container
    if (Platform.OS === 'web') {
      void Linking.openURL(alertoWebUrl);
      return;
    }

    const externalUrl = Platform.select({
      ios: `maps:0,0?q=${lat},${lng}`,
      android: `geo:${lat},${lng}?q=${lat},${lng}`,
      default: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
    });

    Alert.alert(
      'Open in Maps',
      'Choose how you want to view the device location:',
      [
        {
          text: 'Alerto App Map',
          onPress: () => {
            router.push({
              pathname: '/(main)/map-select',
              params: {
                destLat: lat.toString(),
                destLng: lng.toString(),
                placeName: 'Alerto Tracker Device',
              },
            });
          },
        },
        {
          text: 'Alerto Web Map',
          onPress: () => {
            void Linking.openURL(alertoWebUrl);
          },
        },
        {
          text: 'External Maps (Google/Apple)',
          onPress: () => {
            if (externalUrl) void Linking.openURL(externalUrl);
          },
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  // Satellite counts
  const satelliteCount = isConnected && sensorData?.sats != null ? sensorData.sats : (lastLocation?.sats ?? 0);
  const rawSmsSent = isConnected && sensorData?.smsSent != null ? sensorData.smsSent : 0;

  // Calculate SMS Remaining & Expiration
  const {
    isConfigured,
    loadTypeLabel,
    loadBalanceLabel,
    smsRemainingLabel,
    isExpired,
    daysUntilExpiry,
    isNearExpiry,
  } = useMemo(() => {
    if (!loadConfig) {
      return {
        isConfigured: false,
        loadTypeLabel: 'N/A',
        loadBalanceLabel: 'N/A',
        smsRemainingLabel: 'N/A',
        isExpired: false,
        daysUntilExpiry: null,
        isNearExpiry: false,
      };
    }

    const isPromo = loadConfig.loadType === 'promo';
    const isUnli = isPromo && !!loadConfig.promoIsUnli;
    const total = isPromo
      ? isUnli
        ? null
        : (loadConfig.promoTotalSms ?? null)
      : (loadConfig.regularAmount ?? null);

    if (!isUnli && (total == null || isNaN(total))) {
      return {
        isConfigured: false,
        loadTypeLabel: 'N/A',
        loadBalanceLabel: 'N/A',
        smsRemainingLabel: 'N/A',
        isExpired: false,
        daysUntilExpiry: null,
        isNearExpiry: false,
      };
    }

    // Hardware sync: SMS used since load configuration
    const used = Math.max(0, rawSmsSent - (loadConfig.baselineSmsSent || 0));
    const remaining = isUnli ? null : Math.max(0, (total as number) - used);

    // Promo Expiration calculations
    let expired = false;
    let daysLeft: number | null = null;
    let nearExpiry = false;

    if (isPromo && loadConfig.expirationDate) {
      const expTime = new Date(loadConfig.expirationDate).getTime();
      const diffMs = expTime - Date.now();
      daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      if (diffMs <= 0) {
        expired = true;
      } else if (daysLeft <= 3) {
        nearExpiry = true;
      }
    }

    const typeLabel = isPromo ? 'Promo' : 'Regular Load';
    const balanceLabel = isPromo
      ? isUnli
        ? 'Unlimited SMS Promo'
        : `${total} SMS Promo`
      : `₱${total} (${total} SMS)`;

    const remLabel = expired
      ? 'Expired'
      : isUnli
      ? 'Unlimited SMS'
      : `${remaining} SMS`;

    return {
      isConfigured: true,
      loadTypeLabel: typeLabel,
      loadBalanceLabel: balanceLabel,
      smsRemainingLabel: remLabel,
      isExpired: expired,
      daysUntilExpiry: daysLeft,
      isNearExpiry: nearExpiry,
    };
  }, [loadConfig, rawSmsSent]);

  // Automatic In-App Notification / Expiration Reminder on Screen Load
  useEffect(() => {
    if (!hasShownExpiryAlert && loadConfig?.loadType === 'promo' && loadConfig.expirationDate) {
      if (isExpired) {
        setHasShownExpiryAlert(true);
        Alert.alert(
          '⚠️ SMS Promo Expired',
          'Your SIM SMS promo has expired. Please reload or update your load settings to ensure emergency SMS alerts can be sent by the tracker.',
          [{ text: 'Update Load', onPress: () => setIsLoadModalVisible(true) }, { text: 'OK' }]
        );
      } else if (isNearExpiry && daysUntilExpiry != null) {
        setHasShownExpiryAlert(true);
        Alert.alert(
          '⏰ SMS Promo Expiring Soon',
          `Your SMS Promo will expire in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'}. Remember to reload your SIM to maintain uninterrupted emergency tracking.`,
          [{ text: 'View Settings', onPress: () => setIsLoadModalVisible(true) }, { text: 'OK' }]
        );
      }
    }
  }, [loadConfig, isExpired, isNearExpiry, daysUntilExpiry, hasShownExpiryAlert]);

  // Handle format switch
  const handleSelectFormat = async (format: SmsFormatType) => {
    setSmsFormat(format);
    await AsyncStorage.setItem(SMS_FORMAT_KEY, format);
    if (isConnected) {
      await sendSmsFormat(format);
    }
  };

  // Format dates for display
  const formatDate = (isoString?: string) => {
    if (!isoString) return 'N/A';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return 'N/A';
    }
  };

  // Sample Coordinates for preview
  const sampleLat = lastLocation ? lastLocation.lat.toFixed(6) : '14.123456';
  const sampleLng = lastLocation ? lastLocation.lng.toFixed(6) : '120.987654';

  return (
    <SafeAreaView style={[s.safeArea, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          style={s.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
          id="tracker-back-btn"
        >
          <IconSymbol name="chevron.left" size={28} color={colors.mainText} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.mainText }]}>Device Tracker</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Promo Expiration In-App Banner */}
        {loadConfig?.loadType === 'promo' && (isExpired || isNearExpiry) && (
          <TouchableOpacity
            style={[
              s.expiryBanner,
              {
                backgroundColor: isExpired ? '#ef444415' : '#f59e0b15',
                borderColor: isExpired ? '#ef444440' : '#f59e0b40',
              },
            ]}
            onPress={() => setIsLoadModalVisible(true)}
            activeOpacity={0.8}
          >
            <IconSymbol
              name="alert-outline"
              size={20}
              color={isExpired ? '#ef4444' : '#f59e0b'}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  s.expiryBannerTitle,
                  { color: isExpired ? '#ef4444' : '#f59e0b' },
                ]}
              >
                {isExpired ? 'SMS Promo Expired' : `Promo Expiring in ${daysUntilExpiry} Day${daysUntilExpiry === 1 ? '' : 's'}`}
              </Text>
              <Text style={[s.expiryBannerSub, { color: colors.text }]}>
                {isExpired
                  ? 'Tap to update your load balance so emergency SMS alerts can be sent.'
                  : `Valid until ${formatDate(loadConfig.expirationDate)}. Tap to configure new load.`}
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Map */}
        <View style={[s.mapWrapper, { borderColor: colors.hr }]}>
          <MapLibreGL.MapView
            ref={mapRef}
            style={StyleSheet.absoluteFillObject}
            mapStyle={mapStyle}
            logoEnabled={false}
            attributionEnabled={false}
            compassEnabled={false}
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
              zoomLevel={16}
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

        {/* GPS Satellite & Hardware Info Row */}
        <View style={s.infoRow}>
          <View style={[s.infoCard, { backgroundColor: colors.card, borderColor: colors.hr, flex: 1 }]}>
            <View style={[s.infoIconWrap, { backgroundColor: '#8b5cf620' }]}>
              <IconSymbol name="satellite-outline" size={18} color="#8b5cf6" />
            </View>
            <Text style={[s.infoLabel, { color: colors.subtitle }]}>GPS Source</Text>
            <Text style={[s.infoValue, { color: colors.text }]}>
              {isConnected ? 'Hardware GPS' : 'Last Synced'}
            </Text>
          </View>

          <View style={[s.infoCard, { backgroundColor: colors.card, borderColor: colors.hr, flex: 1 }]}>
            <View style={[s.infoIconWrap, { backgroundColor: '#0ea5e920' }]}>
              <IconSymbol name="wifi-outline" size={18} color="#0ea5e9" />
            </View>
            <Text style={[s.infoLabel, { color: colors.subtitle }]}>Satellites</Text>
            <Text style={[s.infoValue, { color: colors.text }]}>
              {satelliteCount > 0 ? `${satelliteCount} sats` : '0 sats'}
            </Text>
          </View>
        </View>

        {/* SMS Status Display Card */}
        <View style={[s.smsStatusCard, { backgroundColor: colors.card, borderColor: colors.hr }]}>
          {/* Header */}
          <View style={s.smsCardHeader}>
            <View style={s.smsHeaderLeft}>
              <View style={[s.smsIconBadge, { backgroundColor: '#f59e0b20' }]}>
                <IconSymbol name="chatbubble-outline" size={18} color="#f59e0b" />
              </View>
              <View>
                <Text style={[s.smsCardTitle, { color: colors.text }]}>SIM Load & SMS Status</Text>
                <Text style={[s.smsCardSubtitle, { color: colors.subtitle }]}>GSM Emergency Balance</Text>
              </View>
            </View>

            {/* Set Load Button */}
            <TouchableOpacity
              style={[s.manageLoadBtn, { backgroundColor: '#3b82f618', borderColor: '#3b82f6' }]}
              onPress={() => setIsLoadModalVisible(true)}
              activeOpacity={0.7}
              id="tracker-manage-load-btn"
            >
              <IconSymbol name="create-outline" size={14} color="#3b82f6" />
              <Text style={[s.manageLoadBtnText, { color: '#3b82f6' }]}>Set Load</Text>
            </TouchableOpacity>
          </View>

          {/* Status Items */}
          <View style={s.smsStatusGrid}>
            {/* Load Type */}
            <View style={[s.smsStatItem, { backgroundColor: colors.background, borderColor: colors.hr }]}>
              <Text style={[s.smsStatLabel, { color: colors.subtitle }]}>Load Type</Text>
              <View style={s.loadTypeBadgeWrap}>
                <View
                  style={[
                    s.loadTypePill,
                    {
                      backgroundColor:
                        loadTypeLabel === 'Promo'
                          ? '#8b5cf620'
                          : loadTypeLabel === 'Regular Load'
                          ? '#10b98120'
                          : colors.hr + '40',
                    },
                  ]}
                >
                  <Text
                    style={[
                      s.loadTypePillText,
                      {
                        color:
                          loadTypeLabel === 'Promo'
                            ? '#8b5cf6'
                            : loadTypeLabel === 'Regular Load'
                            ? '#10b981'
                            : colors.subtitle,
                      },
                    ]}
                  >
                    {loadTypeLabel}
                  </Text>
                </View>
              </View>
            </View>

            {/* Load Balance */}
            <View style={[s.smsStatItem, { backgroundColor: colors.background, borderColor: colors.hr }]}>
              <Text style={[s.smsStatLabel, { color: colors.subtitle }]}>Load Balance</Text>
              <Text style={[s.smsStatValue, { color: colors.text }]} numberOfLines={1}>
                {loadBalanceLabel}
              </Text>
            </View>

            {/* SMS Remaining */}
            <View
              style={[
                s.smsStatItem,
                s.smsRemainingHighlightItem,
                {
                  backgroundColor: !isConfigured
                    ? colors.background
                    : isExpired
                    ? '#ef444415'
                    : '#10b98115',
                  borderColor: !isConfigured
                    ? colors.hr
                    : isExpired
                    ? '#ef444440'
                    : '#10b98140',
                },
              ]}
            >
              <Text style={[s.smsStatLabel, { color: colors.subtitle }]}>SMS Remaining</Text>
              <Text
                style={[
                  s.smsRemainingHuge,
                  {
                    color: !isConfigured
                      ? colors.subtitle
                      : isExpired
                      ? '#ef4444'
                      : '#10b981',
                  },
                ]}
              >
                {smsRemainingLabel}
              </Text>
            </View>

            {/* Promo-Only Fields: Start Date & Expiration Date */}
            {loadConfig?.loadType === 'promo' && (
              <View style={[s.promoDatesRow, { borderColor: colors.hr }]}>
                <View style={s.promoDateItem}>
                  <Text style={[s.promoDateLabel, { color: colors.subtitle }]}>Start Date</Text>
                  <Text style={[s.promoDateValue, { color: colors.text }]}>
                    {formatDate(loadConfig.startDate)}
                  </Text>
                </View>

                <View style={s.promoDateDivider} />

                <View style={s.promoDateItem}>
                  <Text style={[s.promoDateLabel, { color: colors.subtitle }]}>Expiration Date</Text>
                  <Text
                    style={[
                      s.promoDateValue,
                      {
                        color: isExpired ? '#ef4444' : isNearExpiry ? '#f59e0b' : colors.text,
                        fontWeight: '700',
                      },
                    ]}
                  >
                    {formatDate(loadConfig.expirationDate)}
                    {isExpired ? ' (Expired)' : ''}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* SMS Message Format Selector (Reordered: 1. Coordinates Only, 2. Combined Message, 3. Separate Messages) */}
        <View style={[s.formatCard, { backgroundColor: colors.card, borderColor: colors.hr }]}>
          <View style={s.formatHeader}>
            <View style={s.formatHeaderLeft}>
              <IconSymbol name="paperplane-outline" size={18} color="#3b82f6" />
              <Text style={[s.formatTitle, { color: colors.text }]}>SMS Message Format</Text>
            </View>
            <Text style={[s.formatSubtitle, { color: colors.subtitle }]}>
              {smsFormat === 'separate' ? '2 SMS per alert' : '1 SMS per alert'}
            </Text>
          </View>

          {/* 3 Selectable Format Options in Requested Order */}
          <View style={s.formatOptionsContainer}>
            {/* 1. Coordinates Only (1 SMS) */}
            <TouchableOpacity
              style={[
                s.formatOptionTile,
                {
                  backgroundColor: colors.background,
                  borderColor: smsFormat === 'coords_only' ? '#3b82f6' : colors.hr,
                  borderWidth: smsFormat === 'coords_only' ? 2 : 1,
                },
              ]}
              onPress={() => handleSelectFormat('coords_only')}
              activeOpacity={0.7}
              id="format-opt-coords-only"
            >
              <View style={s.formatOptionTopRow}>
                <View style={s.radioCircle}>
                  {smsFormat === 'coords_only' && <View style={s.radioDot} />}
                </View>
                <View style={s.formatOptionTitleWrap}>
                  <Text style={[s.formatOptionName, { color: colors.text }]}>1. Coordinates Only</Text>
                  <Text style={[s.formatOptionDesc, { color: colors.subtitle }]}>
                    Clean raw coordinates for fast maps pasting
                  </Text>
                </View>
                <View style={[s.smsCostBadge, { backgroundColor: '#10b98115' }]}>
                  <Text style={[s.smsCostBadgeText, { color: '#10b981' }]}>1 SMS</Text>
                </View>
              </View>
            </TouchableOpacity>

            {/* 2. Combined Message (1 SMS) */}
            <TouchableOpacity
              style={[
                s.formatOptionTile,
                {
                  backgroundColor: colors.background,
                  borderColor: smsFormat === 'combined' ? '#3b82f6' : colors.hr,
                  borderWidth: smsFormat === 'combined' ? 2 : 1,
                },
              ]}
              onPress={() => handleSelectFormat('combined')}
              activeOpacity={0.7}
              id="format-opt-combined"
            >
              <View style={s.formatOptionTopRow}>
                <View style={s.radioCircle}>
                  {smsFormat === 'combined' && <View style={s.radioDot} />}
                </View>
                <View style={s.formatOptionTitleWrap}>
                  <Text style={[s.formatOptionName, { color: colors.text }]}>2. Combined Message</Text>
                  <Text style={[s.formatOptionDesc, { color: colors.subtitle }]}>
                    Alert notification and GPS coordinates in 1 SMS
                  </Text>
                </View>
                <View style={[s.smsCostBadge, { backgroundColor: '#3b82f615' }]}>
                  <Text style={[s.smsCostBadgeText, { color: '#3b82f6' }]}>1 SMS</Text>
                </View>
              </View>
            </TouchableOpacity>

            {/* 3. Separate Messages (2 SMS) */}
            <TouchableOpacity
              style={[
                s.formatOptionTile,
                {
                  backgroundColor: colors.background,
                  borderColor: smsFormat === 'separate' ? '#3b82f6' : colors.hr,
                  borderWidth: smsFormat === 'separate' ? 2 : 1,
                },
              ]}
              onPress={() => handleSelectFormat('separate')}
              activeOpacity={0.7}
              id="format-opt-separate"
            >
              <View style={s.formatOptionTopRow}>
                <View style={s.radioCircle}>
                  {smsFormat === 'separate' && <View style={s.radioDot} />}
                </View>
                <View style={s.formatOptionTitleWrap}>
                  <Text style={[s.formatOptionName, { color: colors.text }]}>3. Separate Messages</Text>
                  <Text style={[s.formatOptionDesc, { color: colors.subtitle }]}>
                    Part 1 Alert notification + Part 2 Coordinates
                  </Text>
                </View>
                <View style={[s.smsCostBadge, { backgroundColor: '#f59e0b15' }]}>
                  <Text style={[s.smsCostBadgeText, { color: '#f59e0b' }]}>2 SMS</Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>

          {/* Live SMS Preview Box */}
          <View style={[s.smsPreviewBox, { backgroundColor: colors.background, borderColor: colors.hr }]}>
            <Text style={[s.smsPreviewHeader, { color: colors.subtitle }]}>SMS MESSAGE PREVIEW</Text>
            {smsFormat === 'coords_only' && (
              <View style={s.smsBubble}>
                <Text style={[s.smsBubbleText, { color: colors.text, fontWeight: '700' }]}>
                  {`${sampleLat}, ${sampleLng}`}
                </Text>
              </View>
            )}

            {smsFormat === 'combined' && (
              <View style={s.smsBubble}>
                <Text style={[s.smsBubbleText, { color: colors.text }]}>
                  {'ALERTO Device location acquired!\n\nCoordinates:\n' + `${sampleLat}, ${sampleLng}`}
                </Text>
              </View>
            )}

            {smsFormat === 'separate' && (
              <View style={{ gap: 8 }}>
                <View style={s.smsBubble}>
                  <Text style={[s.smsBubbleTag, { color: '#f59e0b' }]}>SMS 1 (Alert Notice)</Text>
                  <Text style={[s.smsBubbleText, { color: colors.text }]}>
                    {'ALERTO Device location acquired!\n\nCoordinates will follow in the next text for easy copy-paste into ALERTO App or browser.'}
                  </Text>
                </View>
                <View style={s.smsBubble}>
                  <Text style={[s.smsBubbleTag, { color: '#f59e0b' }]}>SMS 2 (Coordinates)</Text>
                  <Text style={[s.smsBubbleText, { color: colors.text, fontWeight: '700' }]}>
                    {`${sampleLat}, ${sampleLng}`}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* BLE Pair Module Modal */}
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

      {/* Set Load Form Modal */}
      <SmsLoadModal
        visible={isLoadModalVisible}
        onClose={() => setIsLoadModalVisible(false)}
        initialConfig={loadConfig}
        currentHardwareSmsSent={rawSmsSent}
        onSave={async (newConfig) => {
          setLoadConfig(newConfig);
          await AsyncStorage.setItem(SMS_LOAD_KEY, JSON.stringify(newConfig));
          setIsLoadModalVisible(false);
          Alert.alert('Load Updated', 'SIM load and SMS balance updated successfully.');
        }}
        colors={colors}
      />
    </SafeAreaView>
  );
}

// ─── Set Load Modal Component ──────────────────────────────────────────────

interface SmsLoadModalProps {
  visible: boolean;
  onClose: () => void;
  initialConfig: SmsLoadConfig | null;
  currentHardwareSmsSent: number;
  onSave: (config: SmsLoadConfig) => void;
  colors: any;
}

function SmsLoadModal({
  visible,
  onClose,
  initialConfig,
  currentHardwareSmsSent,
  onSave,
  colors,
}: SmsLoadModalProps) {
  // If no previous configuration, default selected tab is Regular
  const [loadType, setLoadType] = useState<'regular' | 'promo'>(
    initialConfig?.loadType || 'regular'
  );

  // Regular load state
  const [regularAmount, setRegularAmount] = useState<string>(
    initialConfig?.regularAmount ? String(initialConfig.regularAmount) : '50'
  );

  // Promo load state (Promo Name removed completely; supports Unli or Custom count)
  const [promoIsUnli, setPromoIsUnli] = useState<boolean>(
    initialConfig?.promoIsUnli ?? false
  );
  const [promoTotalSms, setPromoTotalSms] = useState<string>(
    initialConfig?.promoTotalSms ? String(initialConfig.promoTotalSms) : '100'
  );
  const [promoValidityDays, setPromoValidityDays] = useState<string>(
    initialConfig?.promoValidityDays ? String(initialConfig.promoValidityDays) : '30'
  );

  // Sync initial values when modal opens
  useEffect(() => {
    if (visible) {
      if (initialConfig) {
        setLoadType(initialConfig.loadType);
        setRegularAmount(initialConfig.regularAmount ? String(initialConfig.regularAmount) : '50');
        setPromoIsUnli(initialConfig.promoIsUnli ?? false);
        setPromoTotalSms(initialConfig.promoTotalSms ? String(initialConfig.promoTotalSms) : '100');
        setPromoValidityDays(
          initialConfig.promoValidityDays ? String(initialConfig.promoValidityDays) : '30'
        );
      } else {
        setLoadType('regular');
        setRegularAmount('50');
        setPromoIsUnli(false);
        setPromoTotalSms('100');
        setPromoValidityDays('30');
      }
    }
  }, [visible, initialConfig]);

  const handleSave = () => {
    const now = new Date();
    const days = parseInt(promoValidityDays, 10) || 30;
    const expDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    if (loadType === 'regular') {
      const amt = parseInt(regularAmount, 10);
      if (isNaN(amt) || amt <= 0) {
        Alert.alert('Invalid Amount', 'Please enter a valid load amount (e.g. ₱50).');
        return;
      }

      const updatedConfig: SmsLoadConfig = {
        loadType: 'regular',
        regularAmount: amt,
        startDate: now.toISOString(),
        expirationDate: expDate.toISOString(),
        baselineSmsSent: currentHardwareSmsSent,
      };
      onSave(updatedConfig);
    } else {
      let totalSms: number | undefined = undefined;
      if (!promoIsUnli) {
        totalSms = parseInt(promoTotalSms, 10);
        if (isNaN(totalSms) || totalSms <= 0) {
          Alert.alert('Invalid SMS Count', 'Please enter the total SMS included in your promo or choose Unli.');
          return;
        }
      }

      const updatedConfig: SmsLoadConfig = {
        loadType: 'promo',
        promoIsUnli: promoIsUnli,
        promoTotalSms: promoIsUnli ? undefined : totalSms,
        promoValidityDays: days,
        startDate: now.toISOString(),
        expirationDate: expDate.toISOString(),
        baselineSmsSent: currentHardwareSmsSent,
      };
      onSave(updatedConfig);
    }
  };

  const calculatedExpDateString = useMemo(() => {
    const days = parseInt(promoValidityDays, 10) || 0;
    const exp = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    return exp.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }, [promoValidityDays]);

  const todayString = useMemo(() => {
    return new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }, []);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={m.modalOverlay}
      >
        <View style={[m.modalContainer, { backgroundColor: colors.card, borderColor: colors.hr }]}>
          {/* Modal Header */}
          <View style={m.modalHeader}>
            <View>
              <Text style={[m.modalTitle, { color: colors.text }]}>Set SIM Load</Text>
              <Text style={[m.modalSubtitle, { color: colors.subtitle }]}>
                Select Load Type and enter details
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={m.closeButton}>
              <IconSymbol name="close" size={20} color={colors.subtitle} />
            </TouchableOpacity>
          </View>

          {/* Segmented Tab Switcher */}
          <View style={[m.tabSwitcher, { backgroundColor: colors.background, borderColor: colors.hr }]}>
            <TouchableOpacity
              style={[
                m.tabButton,
                loadType === 'regular' && { backgroundColor: '#10b981', elevation: 2 },
              ]}
              onPress={() => setLoadType('regular')}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  m.tabButtonText,
                  { color: loadType === 'regular' ? '#fff' : colors.subtitle },
                ]}
              >
                Regular Load
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                m.tabButton,
                loadType === 'promo' && { backgroundColor: '#8b5cf6', elevation: 2 },
              ]}
              onPress={() => setLoadType('promo')}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  m.tabButtonText,
                  { color: loadType === 'promo' ? '#fff' : colors.subtitle },
                ]}
              >
                Promo
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={m.modalScroll} showsVerticalScrollIndicator={false}>
            {loadType === 'regular' ? (
              <View style={m.formSection}>
                <Text style={[m.sectionLabel, { color: colors.text }]}>Load Amount (₱)</Text>
                <Text style={[m.sectionHint, { color: colors.subtitle }]}>
                  Rate: ₱1 per SMS (e.g. ₱50 loaded = 50 SMS available).
                </Text>

                {/* Quick Presets */}
                <View style={m.presetsRow}>
                  {['15', '30', '50', '100', '300'].map((amt) => (
                    <TouchableOpacity
                      key={amt}
                      style={[
                        m.presetPill,
                        {
                          backgroundColor:
                            regularAmount === amt ? '#10b98120' : colors.background,
                          borderColor: regularAmount === amt ? '#10b981' : colors.hr,
                        },
                      ]}
                      onPress={() => setRegularAmount(amt)}
                    >
                      <Text
                        style={[
                          m.presetPillText,
                          { color: regularAmount === amt ? '#10b981' : colors.text },
                        ]}
                      >
                        ₱{amt}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Manual Amount Input */}
                <View style={[m.inputWrap, { backgroundColor: colors.background, borderColor: colors.hr }]}>
                  <Text style={[m.inputPrefix, { color: colors.subtitle }]}>₱</Text>
                  <TextInput
                    style={[m.textInput, { color: colors.text }]}
                    keyboardType="number-pad"
                    value={regularAmount}
                    onChangeText={setRegularAmount}
                    placeholder="50"
                    placeholderTextColor={colors.subtitle + '80'}
                  />
                </View>

                {/* Converted SMS Breakdown */}
                <View style={[m.summaryCard, { backgroundColor: '#10b98110', borderColor: '#10b98130' }]}>
                  <IconSymbol name="check-circle-outline" size={18} color="#10b981" />
                  <Text style={[m.summaryCardText, { color: colors.text }]}>
                    Total SMS Available:{' '}
                    <Text style={{ fontWeight: '700', color: '#10b981' }}>
                      {parseInt(regularAmount, 10) > 0 ? `${parseInt(regularAmount, 10)} SMS` : 'N/A'}
                    </Text>
                  </Text>
                </View>
              </View>
            ) : (
              <View style={m.formSection}>
                {/* Total SMS Included vs Unlimited (Unli) Choice */}
                <View style={m.promoChoiceHeaderRow}>
                  <Text style={[m.sectionLabel, { color: colors.text, marginBottom: 0 }]}>
                    Total SMS Included
                  </Text>
                  <View style={m.promoChoiceGroup}>
                    <TouchableOpacity
                      style={[
                        m.promoChoiceBtn,
                        !promoIsUnli && { backgroundColor: '#8b5cf6', borderColor: '#8b5cf6' },
                        { borderColor: colors.hr },
                      ]}
                      onPress={() => setPromoIsUnli(false)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          m.promoChoiceBtnText,
                          { color: !promoIsUnli ? '#ffffff' : colors.subtitle },
                        ]}
                      >
                        Specific Count
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        m.promoChoiceBtn,
                        promoIsUnli && { backgroundColor: '#8b5cf6', borderColor: '#8b5cf6' },
                        { borderColor: colors.hr },
                      ]}
                      onPress={() => setPromoIsUnli(true)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          m.promoChoiceBtnText,
                          { color: promoIsUnli ? '#ffffff' : colors.subtitle },
                        ]}
                      >
                        ♾️ Unli
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {promoIsUnli ? (
                  <View
                    style={[
                      m.unliPromoCard,
                      { backgroundColor: '#8b5cf615', borderColor: '#8b5cf640' },
                    ]}
                  >
                    <IconSymbol name="checkmark-circle-outline" size={20} color="#8b5cf6" />
                    <View style={{ flex: 1 }}>
                      <Text style={[m.unliPromoTitle, { color: '#8b5cf6' }]}>
                        Unlimited SMS Active
                      </Text>
                      <Text style={[m.unliPromoSubtitle, { color: colors.subtitle }]}>
                        No SMS count limit during the validity period. Emergency SMS alerts will be sent continuously without deduction.
                      </Text>
                    </View>
                  </View>
                ) : (
                  <>
                    <Text style={[m.sectionHint, { color: colors.subtitle }]}>
                      Enter the total number of SMS messages in your promo.
                    </Text>
                    <View
                      style={[
                        m.inputWrap,
                        { backgroundColor: colors.background, borderColor: colors.hr },
                      ]}
                    >
                      <TextInput
                        style={[m.textInput, { color: colors.text }]}
                        keyboardType="number-pad"
                        value={promoTotalSms}
                        onChangeText={setPromoTotalSms}
                        placeholder="100"
                        placeholderTextColor={colors.subtitle + '80'}
                      />
                    </View>
                  </>
                )}

                {/* Validity in Days */}
                <Text style={[m.sectionLabel, { color: colors.text, marginTop: 12 }]}>
                  Validity (in days)
                </Text>
                <Text style={[m.sectionHint, { color: colors.subtitle }]}>
                  Duration before the promo expires (e.g. 30 days).
                </Text>
                <View style={[m.inputWrap, { backgroundColor: colors.background, borderColor: colors.hr }]}>
                  <TextInput
                    style={[m.textInput, { color: colors.text }]}
                    keyboardType="number-pad"
                    value={promoValidityDays}
                    onChangeText={setPromoValidityDays}
                    placeholder="30"
                    placeholderTextColor={colors.subtitle + '80'}
                  />
                </View>

                {/* Date Calculation Preview */}
                <View style={[m.promoPreviewCard, { backgroundColor: '#8b5cf610', borderColor: '#8b5cf630' }]}>
                  <View style={m.promoPreviewRow}>
                    <Text style={[m.promoPreviewLabel, { color: colors.subtitle }]}>Start Date:</Text>
                    <Text style={[m.promoPreviewVal, { color: colors.text }]}>{todayString}</Text>
                  </View>
                  <View style={m.promoPreviewRow}>
                    <Text style={[m.promoPreviewLabel, { color: colors.subtitle }]}>Expiration Date:</Text>
                    <Text style={[m.promoPreviewVal, { color: '#8b5cf6', fontWeight: '700' }]}>
                      {calculatedExpDateString} ({promoValidityDays || 'N/A'} days)
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Action Buttons */}
          <View style={m.modalFooter}>
            <TouchableOpacity
              style={[m.cancelBtn, { borderColor: colors.hr }]}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={[m.cancelBtnText, { color: colors.subtitle }]}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[m.saveBtn, { backgroundColor: loadType === 'promo' ? '#8b5cf6' : '#10b981' }]}
              onPress={handleSave}
              activeOpacity={0.8}
            >
              <Text style={m.saveBtnText}>Save & Update</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 40, gap: 14 },

  // In-App Expiration Banner
  expiryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  expiryBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  expiryBannerSub: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },

  mapWrapper: {
    height: 250,
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
  coordValue: { fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] },
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

  // Info Cards
  infoRow: { flexDirection: 'row', gap: 12 },
  infoCard: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
    alignItems: 'flex-start',
  },
  infoIconWrap: { padding: 6, borderRadius: 8, marginBottom: 2 },
  infoLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  infoValue: { fontSize: 13, fontWeight: '700' },

  // SMS Load & Status Card
  smsStatusCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  smsCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  smsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  smsIconBadge: {
    padding: 8,
    borderRadius: 10,
  },
  smsCardTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  smsCardSubtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  manageLoadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  manageLoadBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  smsStatusGrid: {
    gap: 8,
  },
  smsStatItem: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  smsStatLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  smsStatValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  loadTypeBadgeWrap: {
    flexDirection: 'row',
  },
  loadTypePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  loadTypePillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  smsRemainingHighlightItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  smsRemainingHuge: {
    fontSize: 17,
    fontWeight: '800',
  },
  promoDatesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    marginTop: 4,
  },
  promoDateItem: {
    flex: 1,
  },
  promoDateDivider: {
    width: 1,
    height: '80%',
    backgroundColor: '#88888830',
    marginHorizontal: 12,
  },
  promoDateLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  promoDateValue: {
    fontSize: 12,
    marginTop: 2,
  },

  // Format Card
  formatCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 14,
  },
  formatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  formatHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  formatTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  formatSubtitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  formatOptionsContainer: {
    gap: 8,
  },
  formatOptionTile: {
    padding: 12,
    borderRadius: 12,
  },
  formatOptionTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#3b82f6',
  },
  formatOptionTitleWrap: {
    flex: 1,
  },
  formatOptionName: {
    fontSize: 13,
    fontWeight: '700',
  },
  formatOptionDesc: {
    fontSize: 11,
    marginTop: 1,
  },
  smsCostBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  smsCostBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // SMS Preview Box
  smsPreviewBox: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  smsPreviewHeader: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  smsBubble: {
    backgroundColor: '#3b82f612',
    padding: 10,
    borderRadius: 10,
    gap: 4,
  },
  smsBubbleTag: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  smsBubbleText: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
});

// Modal Styles
const m = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: '#00000080',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeButton: {
    padding: 6,
  },
  tabSwitcher: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  modalScroll: {
    maxHeight: 320,
  },
  formSection: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  sectionHint: {
    fontSize: 11,
    marginBottom: 4,
  },
  promoChoiceHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  promoChoiceGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  promoChoiceBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  promoChoiceBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  unliPromoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginVertical: 4,
  },
  unliPromoTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  unliPromoSubtitle: {
    fontSize: 11,
    lineHeight: 16,
  },
  presetsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  presetPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  presetPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 46,
  },
  inputPrefix: {
    fontSize: 16,
    fontWeight: '700',
    marginRight: 6,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
  },
  summaryCardText: {
    fontSize: 13,
  },
  promoPreviewCard: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 12,
    gap: 6,
  },
  promoPreviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  promoPreviewLabel: {
    fontSize: 12,
  },
  promoPreviewVal: {
    fontSize: 12,
    fontWeight: '600',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
});
