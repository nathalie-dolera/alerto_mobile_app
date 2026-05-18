import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { Colors } from '@/constants/color';
import { IconSymbol } from '@/components/ui/icon-symbol';

type MetricsGridProps = {
  isLandscape: boolean;
  eyeOpenPercent: number;
  faceDetected: boolean;
  wearableConnected: boolean;
  wearableName: string;
};

export function MetricsGrid({
  isLandscape,
  eyeOpenPercent,
  faceDetected,
  wearableConnected,
  wearableName,
}: MetricsGridProps) {
  const theme = useColorScheme() ?? 'light';
  const colors = Colors[theme as 'light' | 'dark'];

  return (
    <View style={[styles.metricsGrid, isLandscape && styles.metricsGridLandscape]}>
      <View style={styles.metricBox}>
        <View style={styles.metricHeader}>
          <IconSymbol name="eye" size={16} color="rgba(255,255,255,0.7)" />
          <Text style={styles.metricLabel}>Eye Open</Text>
        </View>
        <Text style={styles.metricValue}>
          {faceDetected ? `${eyeOpenPercent}%` : '--'}
        </Text>
      </View>

      <View style={styles.metricBox}>
        <View style={styles.metricHeader}>
          <IconSymbol name="watch" size={16} color="rgba(255,255,255,0.7)" />
          <Text style={styles.metricLabel}>Wearable</Text>
        </View>
        <Text
          style={[
            styles.metricValue,
            { color: wearableConnected ? colors.lightning : colors.warningIcon },
          ]}
          numberOfLines={1}
        >
          {wearableConnected ? 'Connected' : 'Offline'}
        </Text>
        {wearableConnected && (
          <Text style={styles.metricSubvalue} numberOfLines={1}>
            {wearableName}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  metricsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  metricsGridLandscape: {
    flexWrap: 'nowrap',
  },
  metricBox: {
    flex: 1,
    minWidth: 82,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  metricLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
  },
  metricValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  metricSubvalue: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 11,
    marginTop: 2,
  },
});
