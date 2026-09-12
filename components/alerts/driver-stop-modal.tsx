import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/color';
import { DriverStopType } from '@/context/map-context';
import React, { useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
  ScrollView,
} from 'react-native';

interface DriverStopModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (reason: string, stopType: DriverStopType, durationMinutes: number) => void;
}

const PRESET_REASONS = [
  { id: 'gas', label: 'Gas Station', icon: 'fuelpump.fill' as const },
  { id: 'bathroom', label: 'Bathroom Break', icon: 'figure.stand.line.dotted.figure.stand' as const },
  { id: 'toll', label: 'Toll Gate', icon: 'car.fill' as const },
  { id: 'traffic', label: 'Traffic /\nCheckpoint', icon: 'exclamationmark.triangle.fill' as const },
];

const SNOOZE_OPTIONS = [5, 10, 15, 20];

export function DriverStopModal({ visible, onClose, onConfirm }: DriverStopModalProps) {
  const theme = useColorScheme() ?? 'light';
  const colors = Colors[theme as 'light' | 'dark'];
  
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [customReason, setCustomReason] = useState('');
  const [selectedDuration, setSelectedDuration] = useState<number>(5);
  const [customDuration, setCustomDuration] = useState('');

  const handleConfirm = () => {
    let finalReason = '';
    let stopType: DriverStopType = 'CUSTOM';
    
    if (customReason.trim()) {
      finalReason = customReason.trim();
    } else if (selectedPreset) {
      const preset = PRESET_REASONS.find(p => p.id === selectedPreset);
      if (preset) {
        finalReason = preset.label.replace('\n', ' ');
        if (selectedPreset === 'gas') stopType = 'GAS_STATION';
        if (selectedPreset === 'bathroom') stopType = 'BATHROOM_BREAK';
        if (selectedPreset === 'toll') stopType = 'TOLL_GATE';
        if (selectedPreset === 'traffic') stopType = 'TRAFFIC_CHECKPOINT';
      }
    } else {
      finalReason = 'Driver stop reported';
    }

    const duration = customDuration ? parseInt(customDuration, 10) || selectedDuration : selectedDuration;
    
    onConfirm(finalReason, stopType, duration);
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: theme === 'dark' ? '#1e2123' : '#ffffff' }]}>
          <ScrollView bounces={false} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.mainText }]}>Report a Stop</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <IconSymbol name="xmark" size={20} color={colors.subtitle} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.subtitle, { color: colors.subtitle }]}>
              Select a reason or type your own. This pauses the commuter's safety alerts temporarily.
            </Text>

            {/* Grid */}
            <View style={styles.grid}>
              {PRESET_REASONS.map(preset => {
                const isSelected = selectedPreset === preset.id;
                return (
                  <TouchableOpacity
                    key={preset.id}
                    style={[
                      styles.gridItem,
                      {
                        backgroundColor: isSelected ? '#3f51b5' : '#d2e3fc',
                      }
                    ]}
                    onPress={() => {
                      setSelectedPreset(preset.id);
                      setCustomReason('');
                    }}
                    activeOpacity={0.8}
                  >
                    <IconSymbol 
                      name={preset.icon} 
                      size={28} 
                      color={isSelected ? '#ffffff' : '#3f51b5'} 
                      style={{ marginBottom: 12 }}
                    />
                    <Text style={[styles.gridLabel, { color: isSelected ? '#ffffff' : '#3f51b5' }]}>
                      {preset.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Custom Reason */}
            <Text style={styles.sectionTitle}>CUSTOM REASON</Text>
            <TextInput
              style={[styles.input, { backgroundColor: '#d2e3fc', color: '#3f51b5' }]}
              placeholder="e.g. Flat tire, buying snacks, police"
              placeholderTextColor="#7e9ad1"
              value={customReason}
              onChangeText={(text) => {
                setCustomReason(text);
                if (text) setSelectedPreset(null);
              }}
            />

            {/* Snooze Duration */}
            <Text style={styles.sectionTitle}>SNOOZE DURATION</Text>
            <View style={styles.snoozeRow}>
              {SNOOZE_OPTIONS.map(mins => {
                const isSelected = selectedDuration === mins && !customDuration;
                return (
                  <TouchableOpacity
                    key={mins}
                    style={[
                      styles.snoozePill,
                      { backgroundColor: isSelected ? '#3f51b5' : '#d2e3fc' }
                    ]}
                    onPress={() => {
                      setSelectedDuration(mins);
                      setCustomDuration('');
                    }}
                  >
                    <Text style={[styles.snoozeText, { color: isSelected ? '#ffffff' : '#3f51b5' }]}>
                      {mins} min
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TextInput
              style={[styles.input, { backgroundColor: '#d2e3fc', color: '#3f51b5', marginTop: 12 }]}
              placeholder="Or type custom minutes (e.g. 25)"
              placeholderTextColor="#7e9ad1"
              keyboardType="number-pad"
              value={customDuration}
              onChangeText={setCustomDuration}
            />

            {/* Actions */}
            <TouchableOpacity
              style={[styles.confirmBtn, { backgroundColor: '#3f51b5' }]}
              onPress={handleConfirm}
              activeOpacity={0.8}
            >
              <IconSymbol name="checkmark.circle.fill" size={20} color="#ffffff" style={{ marginRight: 8 }} />
              <Text style={styles.confirmBtnText}>Confirm Stop</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <Text style={[styles.cancelBtnText, { color: colors.subtitle }]}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 40,
  },
  container: {
    width: '100%',
    borderRadius: 24,
    maxHeight: '100%',
  },
  scrollContent: {
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
  },
  closeBtn: {
    padding: 4,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  gridItem: {
    width: '48%',
    aspectRatio: 1.1,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  gridLabel: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3f51b5',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  input: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 24,
  },
  snoozeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  snoozePill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  snoozeText: {
    fontSize: 14,
    fontWeight: '700',
  },
  confirmBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 14,
    marginBottom: 12,
  },
  confirmBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  cancelBtn: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
