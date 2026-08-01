import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/color';
import { DriverStopType } from '@/context/map-context';
import React, { useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';

interface DriverStopOption {
  type: DriverStopType;
  label: string;
  icon: string;
  defaultMinutes: number;
}

const STOP_OPTIONS: DriverStopOption[] = [
  { type: 'GAS_STATION', label: 'Gas Station', icon: 'gas-station', defaultMinutes: 15 },
  { type: 'REST_AREA', label: 'Bathroom Break', icon: 'human-male-female', defaultMinutes: 15 },
  { type: 'TOLL_GATE', label: 'Toll Gate', icon: 'boom-gate-outline', defaultMinutes: 5 },
  { type: 'TRAFFIC', label: 'Traffic / Checkpoint', icon: 'traffic-light', defaultMinutes: 10 },
];

const DURATION_OPTIONS = [5, 10, 15, 20];

interface DriverStopModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (reason: string, stopType: DriverStopType, durationMinutes: number) => void;
}

export function DriverStopModal({ visible, onClose, onConfirm }: DriverStopModalProps) {
  const theme = useColorScheme() ?? 'light';
  const colors = Colors[theme as 'light' | 'dark'];

  const [selectedType, setSelectedType] = useState<DriverStopType | null>(null);
  const [customReason, setCustomReason] = useState('');
  const [selectedDuration, setSelectedDuration] = useState<number | null>(15);
  const [customDuration, setCustomDuration] = useState('');

  const resetState = () => {
    setSelectedType(null);
    setCustomReason('');
    setSelectedDuration(15);
    setCustomDuration('');
  };

  const handleQuickSelect = (option: DriverStopOption) => {
    setSelectedType(option.type);
    setCustomReason('');
  };

  const handleConfirm = () => {
    const type = selectedType || 'CUSTOM';
    const reason = customReason.trim() || STOP_OPTIONS.find(o => o.type === selectedType)?.label || 'Manual stop';
    const finalDuration = customDuration.trim().length > 0 ? parseInt(customDuration, 10) : (selectedDuration ?? 15);
    onConfirm(reason, type, finalDuration);
    resetState();
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const isCustomMode = selectedType === null && customReason.trim().length > 0;
  const canConfirm = selectedType !== null || customReason.trim().length > 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: colors.background }]}>

          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.mainText }]}>Report a Stop</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <IconSymbol name="xmark" size={22} color={colors.subtitle} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.subtitle, { color: colors.subtitle }]}>
            Select a reason or type your own. This pauses the commuter's safety alerts temporarily.
          </Text>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.scrollArea}>
            
            <View style={styles.optionsGrid}>
              {STOP_OPTIONS.map((option) => {
                const isSelected = selectedType === option.type;
                return (
                  <TouchableOpacity
                    key={option.type}
                    style={[
                      styles.optionCard,
                      {
                        backgroundColor: isSelected ? colors.activeCard : colors.configColor,
                        borderColor: isSelected ? colors.activeCard : colors.hr,
                      },
                    ]}
                    onPress={() => handleQuickSelect(option)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.optionIconBox, { backgroundColor: isSelected ? colors.activeIconBox : 'rgba(59,79,176,0.1)' }]}>
                      <IconSymbol
                        name={option.icon}
                        size={24}
                        color={isSelected ? colors.activeText : colors.primaryIcon}
                      />
                    </View>
                    <Text
                      style={[
                        styles.optionLabel,
                        { color: isSelected ? colors.activeText : colors.mainText },
                      ]}
                      numberOfLines={2}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Custom reason */}
            <Text style={[styles.sectionLabel, { color: colors.containerText, marginTop: 20 }]}>
              CUSTOM REASON
            </Text>
            <TextInput
              style={[
                styles.customInput,
                {
                  backgroundColor: colors.configColor,
                  color: colors.mainText,
                  borderColor: isCustomMode ? colors.activeCard : colors.hr,
                },
              ]}
              placeholder="e.g. Flat tire, buying snacks, police checkpoint..."
              placeholderTextColor={colors.subtitle}
              value={customReason}
              onChangeText={(text) => {
                setCustomReason(text);
                if (text.trim().length > 0) {
                  setSelectedType(null);
                }
              }}
              onFocus={() => {
                if (customReason.trim().length > 0) setSelectedType(null);
              }}
              multiline={false}
            />

            {/* Duration selector */}
            <Text style={[styles.sectionLabel, { color: colors.containerText, marginTop: 20 }]}>
              SNOOZE DURATION
            </Text>
            <View style={styles.durationRow}>
              {DURATION_OPTIONS.map((mins) => {
                const isActive = selectedDuration === mins && customDuration.trim().length === 0;
                return (
                  <TouchableOpacity
                    key={mins}
                    style={[
                      styles.durationChip,
                      {
                        backgroundColor: isActive ? colors.activeCard : colors.configColor,
                        borderColor: isActive ? colors.activeCard : colors.hr,
                      },
                    ]}
                    onPress={() => {
                      setSelectedDuration(mins);
                      setCustomDuration('');
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.durationChipText,
                        { color: isActive ? colors.activeText : colors.mainText },
                      ]}
                    >
                      {mins} min
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TextInput
              style={[
                styles.customInput,
                {
                  backgroundColor: colors.configColor,
                  color: colors.mainText,
                  borderColor: customDuration.trim().length > 0 ? colors.activeCard : colors.hr,
                  marginTop: 10,
                },
              ]}
              placeholder="Or type custom minutes (e.g. 25)"
              placeholderTextColor={colors.subtitle}
              value={customDuration}
              onChangeText={(text) => {
                const nums = text.replace(/[^0-9]/g, '');
                setCustomDuration(nums);
                if (nums.length > 0) {
                  setSelectedDuration(null);
                }
              }}
              keyboardType="number-pad"
              maxLength={3}
            />
          </ScrollView>

          {/* Action buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[
                styles.confirmBtn,
                {
                  backgroundColor: canConfirm ? colors.activeCard : colors.hr,
                },
              ]}
              onPress={handleConfirm}
              disabled={!canConfirm}
              activeOpacity={0.8}
            >
              <IconSymbol name="check-circle" size={20} color={colors.activeText} style={{ marginRight: 8 }} />
              <Text style={[styles.confirmText, { color: colors.activeText }]}>
                Confirm Stop
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.cancelBtn, { borderColor: colors.hr }]}
              onPress={handleClose}
              activeOpacity={0.8}
            >
              <Text style={[styles.cancelText, { color: colors.subtitle }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 36,
    maxHeight: '95%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 6,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 18,
  },
  scrollArea: {
    maxHeight: 600,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  optionCard: {
    width: '47%',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  optionIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  optionDuration: {
    fontSize: 12,
    fontWeight: '500',
  },
  customInput: {
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  durationRow: {
    flexDirection: 'row',
    gap: 10,
  },
  durationChip: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  durationChipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  actions: {
    marginTop: 20,
    gap: 10,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 14,
  },
  confirmText: {
    fontSize: 16,
    fontWeight: '700',
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
