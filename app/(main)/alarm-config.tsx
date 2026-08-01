import { TabButton } from "@/components/alarm-config/tab-button";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors } from "@/constants/color";
import { useMapContext } from '@/context/map-context';
import { useSavedPlacesContext } from "@/context/saved-places";
import { IntensityLevel, useAlarmConfig } from '@/hooks/use-alarm-config';
import { SavedPlacesService } from "@/services/saved-places";
import { parseDistanceToMeters } from "@/utils/alarm-settings";
import Slider from '@react-native-community/slider';
import { useLocalSearchParams, useRouter } from "expo-router";
import * as SecureStore from 'expo-secure-store';
import React, { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, useColorScheme, View } from "react-native";

const DISTANCE_PRESETS = ['500m', '1km', '2km'];
const DISTANCE_UNITS = ['m', 'km'] as const;
type DistanceUnit = typeof DISTANCE_UNITS[number];

function formatDistance(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`;
}

function formatEta(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes >= 60 ? `${Math.floor(minutes / 60)} hr ${minutes % 60} min` : `${minutes} min`;
}

function getParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function splitDistanceSetting(distance: string) {
  const match = distance.trim().toLowerCase().match(/^([0-9.]+)\s*(km|m)$/);

  if (!match) {
    return null;
  }

  return {
    value: match[1],
    unit: match[2] as DistanceUnit,
  };
}

export default function AlarmConfigScreen() {
  const router = useRouter();
  const theme = useColorScheme() ?? 'light';
  const colors = Colors[theme as 'light' | 'dark'];
  const logic = useAlarmConfig();
  const { setDistance, setIntensityRaw, setDuration } = logic;
  const [customDistanceValue, setCustomDistanceValue] = useState('');
  const [customDistanceUnit, setCustomDistanceUnit] = useState<DistanceUnit>('km');
  const [isCustomDistanceOpen, setIsCustomDistanceOpen] = useState(false);
  const params = useLocalSearchParams();
  const { startAlarm, locationName } = useMapContext();
  const placeId = params.placeId as string;
  const placeName = params.placeName as string;
  const passedDistance = params.distance as string;
  const passedIntensity = params.intensity as IntensityLevel;
  const passedDuration = params.duration ? Number(params.duration) : undefined;
  const routeDistanceMeters = Number(getParamValue(params.routeDistanceMeters));
  const routeEtaSeconds = Number(getParamValue(params.routeEtaSeconds));
  const hasRouteDistance = Number.isFinite(routeDistanceMeters) && routeDistanceMeters > 0;
  const hasRouteEta = Number.isFinite(routeEtaSeconds) && routeEtaSeconds > 0;
  const { loadSavedPlaces } = useSavedPlacesContext();
  const fromSavedPlaces = params.fromSavedPlaces === 'true';
  const isGlobalDefault = params.isGlobalDefault === 'true';
  const isPresetDistance = DISTANCE_PRESETS.includes(logic.distance);
  const selectedThresholdMeters = parseDistanceToMeters(logic.distance);
  const activationDistanceStatus = (() => {
    if (!hasRouteDistance || selectedThresholdMeters === null) {
      return null;
    }

    const visibleRouteDistanceMeters = routeDistanceMeters >= 1000
      ? Math.round(routeDistanceMeters / 10) * 10
      : Math.round(routeDistanceMeters);

    const safeSelectedThreshold = Math.round(selectedThresholdMeters);
    const remainingMeters = visibleRouteDistanceMeters - safeSelectedThreshold;

    if (remainingMeters < 0) {
      return {
        type: 'error',
        label: 'Exceeded',
        message: `Activation distance is farther than the trip distance of ${formatDistance(routeDistanceMeters)}.`,
      };
    }

    if (remainingMeters === 0) {
      return {
        type: 'warning',
        label: 'Same distance',
        message: 'Activation distance is exactly the same as the trip distance and will trigger immediately upon starting.',
      };
    }

    if (remainingMeters > 0 && remainingMeters <= 50) {
      return {
        type: 'warning',
        label: 'Too close',
        message: 'Activation distance is very close to the total trip distance. Note that the exact timing depends on your transportation speed.',
      };
    }

    if (selectedThresholdMeters <= 499) {
      return {
        type: 'warning',
        label: 'Too close',
        message: '500m is the recommended minimum. The alarm will trigger extremely close to your destination.',
      };
    }

    return null;
  })();

  useEffect(() => {
    const initializeSettings = async () => {
      if (passedDistance || passedIntensity || passedDuration) {
        if (passedDistance) setDistance(passedDistance);
        if (passedIntensity) setIntensityRaw(passedIntensity as IntensityLevel);
        if (passedDuration) setDuration(Number(passedDuration));
      } else {
        try {
          const globalSettings = await SecureStore.getItemAsync('globalAlarmConfig');
          if (globalSettings) {
            const parsed = JSON.parse(globalSettings);
            setDistance(parsed.distance);
            setIntensityRaw(parsed.intensity);
            setDuration(parsed.duration);
          }
        } catch (error) {
          console.error("Failed to load global settings", error);
        }
      }
    };

    initializeSettings();
  }, [passedDistance, passedIntensity, passedDuration, setDistance, setIntensityRaw, setDuration]);

  useEffect(() => {
    const parsed = splitDistanceSetting(logic.distance);

    if (parsed && !DISTANCE_PRESETS.includes(logic.distance)) {
      setCustomDistanceValue(parsed.value);
      setCustomDistanceUnit(parsed.unit);
    }
  }, [logic.distance]);

  const handlePresetDistance = (distance: string) => {
    const parsed = splitDistanceSetting(distance);

    if (parsed) {
      setCustomDistanceValue(parsed.value);
      setCustomDistanceUnit(parsed.unit);
    }

    logic.setDistance(distance);
  };

  const handleCustomDistanceChange = (value: string) => {
    const numericValue = value.replace(/[^0-9.]/g, '');
    const parts = numericValue.split('.');
    const cleanValue = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : numericValue;
    setCustomDistanceValue(cleanValue);
    logic.setDistance(cleanValue ? `${cleanValue}${customDistanceUnit}` : '');
  };

  const handleCustomDistanceUnit = (unit: DistanceUnit) => {
    setCustomDistanceUnit(unit);

    if (customDistanceValue) {
      logic.setDistance(`${Number(customDistanceValue)}${unit}`);
    }
  };

  const openCustomDistance = () => {
    const parsed = splitDistanceSetting(logic.distance);

    if (parsed && !isPresetDistance) {
      setCustomDistanceValue(parsed.value);
      setCustomDistanceUnit(parsed.unit);
    }

    setIsCustomDistanceOpen(value => !value);
  };

  const getEquivalentDistance = () => {
    if (!customDistanceValue || !hasRouteDistance) return '';
    const val = Number(customDistanceValue);
    if (!Number.isFinite(val) || val <= 0) return '';

    const selectedThreshold = customDistanceUnit === 'km' ? val * 1000 : val;

    const visibleRouteDistanceMeters = routeDistanceMeters >= 1000
      ? Math.round(routeDistanceMeters / 10) * 10
      : Math.round(routeDistanceMeters);

    const safeSelectedThreshold = Math.round(selectedThreshold);
    const diff = visibleRouteDistanceMeters - safeSelectedThreshold;

    if (diff < 0) {
      return `Exceeds trip by ${formatDistance(Math.abs(diff))}`;
    } else if (diff === 0) {
      return `Exact trip distance`;
    } else {
      return `Difference: ${formatDistance(diff)}`;
    }
  };

  const handleCheckDistanceOnSubmit = () => {
    if (activationDistanceStatus) {
      if (activationDistanceStatus.type === 'error') {
        Alert.alert(
          'Check activation distance',
          activationDistanceStatus.message
        );
      } else if (activationDistanceStatus.type === 'warning') {
        Alert.alert(
          'Distance Warning',
          activationDistanceStatus.message
        );
      }
    }
  };

  const proceedWithSave = async (thresholdMeters: number) => {
    //for global default configuring
    if (isGlobalDefault) {
      const configToSave = {
        distance: logic.distance,
        intensity: logic.intensity,
        duration: logic.duration
      };
      await SecureStore.setItemAsync('globalAlarmConfig', JSON.stringify(configToSave));
      router.back();
      return;
    }
    if (placeId) {
      //for saved place configuring
      try {
        await SavedPlacesService.update(placeId, {
          distance: logic.distance,
          intensity: logic.intensity,
          duration: logic.duration
        });
        await loadSavedPlaces();
        router.push('/(main)/save-place');
      } catch (error) { console.error(error); }
    }
    else if (fromSavedPlaces || logic.saveSettings) {
      //add new place like when from saved place ui
      router.push({
        pathname: '/save-location',
        params: {
          placeName: params.placeName,
          distance: logic.distance,
          intensity: logic.intensity,
          duration: logic.duration,
          redirectToSaved: fromSavedPlaces ? 'true' : 'false'
        }
      });
    }
    else {
      const destLat = params.destLat ? parseFloat(params.destLat as string) : 0;
      const destLng = params.destLng ? parseFloat(params.destLng as string) : 0;

      await startAlarm(
        placeName || locationName || 'Unknown',
        destLat,
        destLng,
        thresholdMeters,
        {
          intensity: logic.intensity,
          durationSeconds: logic.duration,
        }
      );
      router.push({
        pathname: '/(tabs)/alerts'
      });
    }
  };

  const handleSetAlarm = () => {
    const thresholdMeters = parseDistanceToMeters(logic.distance);

    if (thresholdMeters === null) {
      Alert.alert(
        'Invalid distance',
        'Enter a number only, then choose whether the activation distance is in meters or kilometers.'
      );
      return;
    }

    if (activationDistanceStatus) {
      if (activationDistanceStatus.type === 'error') {
        Alert.alert(
          'Check activation distance',
          activationDistanceStatus.message
        );
        return;
      } else if (activationDistanceStatus.type === 'warning') {
        Alert.alert(
          'Are you sure?',
          activationDistanceStatus.message,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Yes, proceed', onPress: () => proceedWithSave(thresholdMeters) }
          ]
        );
        return;
      }
    }

    proceedWithSave(thresholdMeters);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>

        <TouchableOpacity
          onPress={() => router.back()}>
          <IconSymbol name="chevron.left" size={24} color={colors.text} />
        </TouchableOpacity>

        <Text
          style={[styles.headerTitle,
          { color: colors.text }]}>
          Alarm Configuration
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {hasRouteDistance && (
        <View
          style={[
            styles.routeInfoCard,
            {
              backgroundColor: activationDistanceStatus?.type === 'error' ? '#FEE2E2' : activationDistanceStatus?.type === 'warning' ? '#FEF3C7' : '#FFFFFF',
              borderColor: activationDistanceStatus?.type === 'error' ? '#DC2626' : activationDistanceStatus?.type === 'warning' ? '#D97706' : '#E5E7EB',
            }
          ]}
        >
          <View style={styles.routeInfoItem}>
            <Text style={[styles.routeInfoLabel, { color: activationDistanceStatus?.type === 'error' ? '#B91C1C' : activationDistanceStatus?.type === 'warning' ? '#B45309' : '#6B7280' }]}>Distance</Text>
            <Text style={[styles.routeInfoValue, { color: activationDistanceStatus?.type === 'error' ? '#7F1D1D' : activationDistanceStatus?.type === 'warning' ? '#92400E' : '#111827' }]}>{formatDistance(routeDistanceMeters)}</Text>
          </View>
          <View style={styles.routeInfoDivider} />
          <View style={styles.routeInfoItem}>
            <Text style={[styles.routeInfoLabel, { color: activationDistanceStatus?.type === 'error' ? '#B91C1C' : activationDistanceStatus?.type === 'warning' ? '#B45309' : '#6B7280' }]}>ETA</Text>
            <Text style={[styles.routeInfoValue, { color: activationDistanceStatus?.type === 'error' ? '#7F1D1D' : activationDistanceStatus?.type === 'warning' ? '#92400E' : '#111827' }]}>
              {hasRouteEta ? formatEta(routeEtaSeconds) : '--'}
            </Text>
          </View>
          {activationDistanceStatus && (
            <Text style={[styles.routeInfoWarning, { color: activationDistanceStatus.type === 'error' ? '#B91C1C' : '#B45309' }]}>
              {activationDistanceStatus.label}: {activationDistanceStatus.message}
            </Text>
          )}
        </View>
      )}
      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Activation Distance
      </Text>
      <View style={[styles.tabsContainer, { backgroundColor: colors.configColor }]}>
        {DISTANCE_PRESETS.map((dist) => (
          <TabButton
            key={dist}
            title={dist}
            isActive={logic.distance === dist}
            onPress={() => handlePresetDistance(dist)}
            colors={colors}
          />
        ))}
      </View>
      <TouchableOpacity style={styles.customDistanceLink} onPress={openCustomDistance}>
        <Text style={[styles.customDistanceLinkText, { color: colors.activeCard }]}>
          Custom distance
        </Text>
        <IconSymbol name={isCustomDistanceOpen ? "chevron.up" : "chevron.down"} size={20} color={colors.activeCard} />
      </TouchableOpacity>
      {isCustomDistanceOpen && (
        <View style={[styles.customDistanceHover, { backgroundColor: colors.configColor }]}>
          <View style={styles.hoverInputCard}>
            <TextInput
              value={customDistanceValue}
              onChangeText={handleCustomDistanceChange}
              keyboardType="decimal-pad"
              returnKeyType="done"
              onSubmitEditing={handleCheckDistanceOnSubmit}
              placeholder="Input distance"
              placeholderTextColor={colors.subtitle}
              style={[
                styles.customDistanceInput,
                {
                  color: colors.text,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.activeCard
                }
              ]}
            />
            <View style={[styles.unitSwitch, { backgroundColor: colors.background }]}>
              {DISTANCE_UNITS.map((unit) => (
                <TouchableOpacity
                  key={unit}
                  style={[
                    styles.unitButton,
                    customDistanceUnit === unit && { backgroundColor: colors.activeCard }
                  ]}
                  onPress={() => handleCustomDistanceUnit(unit)}
                >
                  <Text
                    style={[
                      styles.unitButtonText,
                      { color: customDistanceUnit === unit ? colors.activeText : colors.text }
                    ]}
                  >
                    {unit}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          {customDistanceValue && hasRouteDistance ? (
            <Text style={[styles.customDistanceValue, { color: colors.subtitle, marginRight: 8 }]}>
              {getEquivalentDistance()}
            </Text>
          ) : null}
        </View>
      )}


      <View style={styles.durationHeader}>
        <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 0 }]}>
          Shake Duration
        </Text>
        <Text style={[styles.durationValue, { color: colors.lightning }]}>{logic.duration}
          s
        </Text>
      </View>

      <View style={[styles.sliderCard, { backgroundColor: colors.configColor }]}>
        <Slider
          style={{ width: '100%', height: 40 }}
          minimumValue={logic.currentConfig.minDuration}
          maximumValue={logic.currentConfig.maxDuration}
          step={1}
          value={logic.duration}
          onValueChange={logic.setDuration}
          minimumTrackTintColor={colors.activeCard}
          maximumTrackTintColor={colors.slider}
          thumbTintColor={colors.primaryIcon}
        />
        <View style={styles.sliderLabels}>
          <Text style={{ color: colors.subtitle, fontSize: 12 }}>{logic.currentConfig.minDuration}
            s
          </Text>
          <Text style={{ color: colors.subtitle, fontSize: 12 }}>{logic.currentConfig.maxDuration}
            s
          </Text>
        </View>
      </View>

      {!placeId && !isGlobalDefault && (
        <TouchableOpacity
          style={[styles.checkboxContainer, { backgroundColor: colors.modalThanks }]}
          onPress={() => logic.setSaveSettings(!logic.saveSettings)}
          activeOpacity={0.8}
        >
          <View style={[styles.checkboxIconBox, { backgroundColor: 'transparent' }]}>
            <IconSymbol name="content-save" size={18} color={colors.activeCard} />
          </View>
          <Text style={[styles.checkboxText, { color: colors.text }]}>
            Save Settings for future use
          </Text>
          <View style={[styles.checkbox, logic.saveSettings && { borderWidth: 0, backgroundColor: colors.activeCard }]}>
            {logic.saveSettings && <IconSymbol name="check" size={14} color={colors.activeText} />}
          </View>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[styles.saveBtn, { backgroundColor: colors.activeCard }]}
        onPress={handleSetAlarm}
      >
        <IconSymbol
          name={isGlobalDefault ? "content-save" : placeId || fromSavedPlaces ? "content-save" : "bell"}
          size={20}
          color={colors.activeText}
        />
        <Text style={[styles.saveBtnText, { color: colors.activeText }]}>
          {isGlobalDefault ? "Save Global Configuration"
            : placeId ? "Update Settings"
              : fromSavedPlaces ? "Save Place"
                : "Set Alarm"}
        </Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 50
  },
  scrollContent: {
    paddingBottom: 120
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold'
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 15,
    marginBottom: 10
  },
  tabsContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4
  },
  routeInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
    marginBottom: 4,
    gap: 10
  },
  routeInfoItem: {
    flex: 1
  },
  routeInfoLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  routeInfoValue: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2
  },
  routeInfoDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(128, 128, 128, 0.3)'
  },
  routeInfoWarning: {
    width: '100%',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    color: '#B91C1C'
  },
  customDistanceLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    alignSelf: 'flex-end',
    width: '100%',
    gap: 5,
    marginTop: 10
  },
  customDistanceLinkText: {
    fontSize: 14,
    fontWeight: '700',
    textDecorationLine: 'underline'
  },
  customDistanceValue: {
    fontSize: 12,
    marginTop: 8,
    textAlign: 'right'
  },
  customDistanceHover: {
    alignSelf: 'flex-end',
    width: '100%',
    borderRadius: 14,
    padding: 8,
    marginTop: 10,
    zIndex: 5
  },
  hoverInputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    padding: 8
  },
  customDistanceInput: {
    flex: 1,
    minHeight: 36,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'left'
  },
  unitSwitch: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
    width: 94
  },
  unitButton: {
    flex: 1,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  unitButtonText: {
    fontSize: 13,
    fontWeight: '800'
  },
  durationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 15
  },
  durationValue: {
    fontWeight: 'bold',
    fontSize: 16
  },
  sliderCard: {
    borderRadius: 20,
    padding: 12,
    marginTop: 5
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 5,
    paddingHorizontal: 10
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginTop: 20
  },
  checkboxIconBox: {
    padding: 6,
    borderRadius: 8,
    marginRight: 12
  },
  checkboxText: {
    flex: 1,
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '500'
  },
  checkbox: {
    width: 22,
    height: 22,
    backgroundColor: '#ffffff',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center'
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    height: 56,
    borderRadius: 12
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold'
  }
});
