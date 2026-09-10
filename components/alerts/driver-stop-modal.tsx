import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/color';
import { DriverStopType } from '@/context/map-context';
import React, { useEffect, useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';

interface DriverStopModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (reason: string, stopType: DriverStopType, durationMinutes: number) => void;
}

const AUTO_DISMISS_SECONDS = 8;

export function DriverStopModal({ visible, onClose, onConfirm }: DriverStopModalProps) {
  const theme = useColorScheme() ?? 'light';
  const colors = Colors[theme as 'light' | 'dark'];
  const [countdown, setCountdown] = useState(AUTO_DISMISS_SECONDS);

  useEffect(() => {
    if (!visible) {
      setCountdown(AUTO_DISMISS_SECONDS);
      return;
    }

    setCountdown(AUTO_DISMISS_SECONDS);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onConfirm('Driver stop reported', 'CUSTOM', 5);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [visible, onConfirm]);

  const handleConfirm = () => {
    onConfirm('Driver stop reported', 'CUSTOM', 5);
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View
          style={[
            styles.container,
            {
              backgroundColor: theme === 'dark' ? '#1e2123' : '#ffffff',
              borderColor: colors.hr,
            },
          ]}
        >
          {/* Icon */}
          <View style={[styles.iconBox, { backgroundColor: colors.primaryIcon + '15' }]}>
            <IconSymbol name="pause-circle" size={42} color={colors.primaryIcon} />
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: colors.mainText }]}>
            Driver Stop Reported
          </Text>

          {/* Description */}
          <Text style={[styles.message, { color: colors.subtitle }]}>
            Trip safety alerts are paused for 5 minutes to prevent false alarms while stopped.
          </Text>

          {/* Countdown badge */}
          <View style={[styles.countdownBadge, { backgroundColor: colors.primaryIcon + '12' }]}>
            <IconSymbol name="clock.outline" size={16} color={colors.primaryIcon} />
            <Text style={[styles.countdownText, { color: colors.primaryIcon }]}>
              Auto-confirming in {countdown}s
            </Text>
          </View>

          {/* Action buttons */}
          <TouchableOpacity
            style={[styles.confirmBtn, { backgroundColor: colors.primaryIcon }]}
            onPress={handleConfirm}
            activeOpacity={0.8}
          >
            <IconSymbol name="check-circle" size={18} color="#ffffff" style={{ marginRight: 6 }} />
            <Text style={styles.confirmBtnText}>Confirm Stop (5 mins)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.cancelBtn, { borderColor: colors.hr }]}
            onPress={onClose}
            activeOpacity={0.8}
          >
            <Text style={[styles.cancelBtnText, { color: colors.subtitle }]}>Dismiss</Text>
          </TouchableOpacity>
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
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  container: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  iconBox: {
    width: 68,
    height: 68,
    borderRadius: 34,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 16,
  },
  countdownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 20,
    gap: 6,
  },
  countdownText: {
    fontSize: 13,
    fontWeight: '600',
  },
  confirmBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 10,
  },
  confirmBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  cancelBtn: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
