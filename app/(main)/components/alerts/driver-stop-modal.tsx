// DriverStopModal.tsx – popup modal for reporting a driver stop
// Auto-confirms after countdown, styled to match existing app modals
import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import { Colors } from '@/constants/color';
import { IconSymbol } from '@/components/ui/icon-symbol';

interface DriverStopModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (reason: string, stopType: string, durationMinutes: number) => void;
}

const AUTO_DISMISS_SECONDS = 8;

export const DriverStopModal: React.FC<DriverStopModalProps> = ({ visible, onClose, onConfirm }) => {
  const theme = useColorScheme() ?? 'light';
  const colors = Colors[theme as 'light' | 'dark'];
  const [countdown, setCountdown] = useState(AUTO_DISMISS_SECONDS);

  useEffect(() => {
    if (!visible) {
      setCountdown(AUTO_DISMISS_SECONDS);
      return;
    }

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          onConfirm('Driver stopped', 'commuter_reported', 5);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [visible, onConfirm]);

  const handleConfirm = () => {
    onConfirm('Driver stopped', 'commuter_reported', 5);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: theme === 'dark' ? '#1e2123' : '#ffffff', borderColor: colors.hr }]}>
          {/* Icon */}
          <View style={[styles.iconBox, { backgroundColor: colors.primaryIcon + '15' }]}>
            <IconSymbol name="pause-circle" size={40} color={colors.primaryIcon} />
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: colors.text }]}>Driver Stop Reported</Text>

          {/* Message */}
          <Text style={[styles.message, { color: colors.subtitle }]}>
            A driver stop has been detected. Trip monitoring will pause temporarily to prevent false alerts.
          </Text>

          {/* Countdown */}
          <View style={[styles.countdownBadge, { backgroundColor: colors.primaryIcon + '12' }]}>
            <IconSymbol name="clock.outline" size={16} color={colors.primaryIcon} />
            <Text style={[styles.countdownText, { color: colors.primaryIcon }]}>
              Auto-confirming in {countdown}s
            </Text>
          </View>

          {/* Confirm Button */}
          <TouchableOpacity
            style={[styles.confirmBtn, { backgroundColor: colors.primaryIcon }]}
            onPress={handleConfirm}
            activeOpacity={0.8}
          >
            <IconSymbol name="check-circle" size={18} color="#ffffff" style={{ marginRight: 6 }} />
            <Text style={styles.confirmBtnText}>Confirm Stop</Text>
          </TouchableOpacity>

          {/* Cancel Button */}
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
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  container: {
    width: '85%',
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  countdownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 20,
  },
  countdownText: {
    fontSize: 13,
    fontWeight: '600',
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 10,
  },
  confirmBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  cancelBtn: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
