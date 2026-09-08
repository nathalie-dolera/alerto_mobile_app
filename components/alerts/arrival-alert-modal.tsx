import { IconSymbol } from '@/components/ui/icon-symbol';
import { useBleContext } from '@/context/ble-context';
import React, { useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface ArrivalAlertModalProps {
  visible: boolean;
  onClose: () => void;
  onStopAlarm: () => void;
  destinationName?: string;
  triggerDistanceLabel?: string;
  requiredSecondsOverride?: number | null;
}

export function ArrivalAlertModal({
  visible,
  onClose,
  onStopAlarm,
  destinationName = 'your destination',
  triggerDistanceLabel = '--',
  requiredSecondsOverride,
}: ArrivalAlertModalProps) {
  const { sensorData } = useBleContext();
  const [testShakeProgress, setTestShakeProgress] = useState(0);

  const isCompleted = sensorData?.destinationAlarmCompleted === true || sensorData?.status === 'DESTINATION_CONFIRMED' || sensorData?.status === 'WAKE_SHAKE_DONE';
  const hardwareShakeProgress = sensorData?.shakeProgressSec ?? 0;
  const requiredSeconds = requiredSecondsOverride && requiredSecondsOverride > 0
    ? requiredSecondsOverride
    : sensorData?.wakeShakeSec && sensorData.wakeShakeSec > 0 ? sensorData.wakeShakeSec : 3;

  // Effective accumulated shake duration (only increases when physical shake is detected)
  const accumulatedShake = Math.max(hardwareShakeProgress, testShakeProgress);
  const remainingSeconds = Math.max(0, Math.ceil(requiredSeconds - accumulatedShake));
  const progressPercent = Math.min(1, accumulatedShake / requiredSeconds);

  const onStopAlarmRef = useRef(onStopAlarm);
  onStopAlarmRef.current = onStopAlarm;

  // Reset test shake progress when modal opens
  useEffect(() => {
    if (visible) {
      setTestShakeProgress(0);
    }
  }, [visible]);

  // Automatically close and exit once required shake duration is reached or confirmed by hardware
  useEffect(() => {
    if (visible && (isCompleted || (accumulatedShake >= requiredSeconds && requiredSeconds > 0))) {
      const timeout = setTimeout(() => {
        onStopAlarmRef.current();
      }, 300);
      return () => clearTimeout(timeout);
    }
  }, [visible, isCompleted, accumulatedShake, requiredSeconds]);

  // Fallback tap simulator for testing in app when hardware is not actively connected
  const handleSimulateShakeStep = () => {
    setTestShakeProgress(prev => Math.min(requiredSeconds, prev + 1));
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onStopAlarm}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} activeOpacity={0.7}>
              <IconSymbol name="close" size={22} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          <Text style={styles.title}>Destination Arrived</Text>
          <Text style={styles.message}>
            Arrived at {triggerDistanceLabel} from {destinationName}. Please shake the device for {requiredSeconds}s.
          </Text>

          <TouchableOpacity 
            activeOpacity={0.95} 
            onPress={handleSimulateShakeStep}
            style={styles.circleWrapper}
          >
            <View style={[styles.outerRing3, { transform: [{ scale: 1 + (progressPercent * 0.1) }] }]} />
            <View style={[styles.outerRing2, { transform: [{ scale: 1 + (progressPercent * 0.15) }] }]} />
            <View style={[styles.outerRing1, { transform: [{ scale: 1 + (progressPercent * 0.18) }] }]} />

            <View style={styles.innerCircle}>
              <IconSymbol name="vibrate" size={56} color="#ffffff" />
            </View>
          </TouchableOpacity>

          <Text style={styles.activeText}>Shake detected countdown</Text>
          <Text style={styles.shakeText}>SHAKE TO STOP</Text>
          <Text style={styles.countdownText}>{remainingSeconds}s remaining</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(3, 7, 18, 0.58)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    borderRadius: 24,
    backgroundColor: '#d8e7f5',
    padding: 24,
    alignItems: 'center',
    shadowColor: '#0b1b3d',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 10,
  },
  headerRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 10,
  },
  closeButton: {
    padding: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0b1b3d',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    color: '#2b5866',
    textAlign: 'center',
    marginBottom: 20,
  },
  circleWrapper: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  outerRing3: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(180, 210, 240, 0.35)',
  },
  outerRing2: {
    position: 'absolute',
    width: 186,
    height: 186,
    borderRadius: 93,
    backgroundColor: 'rgba(180, 210, 240, 0.55)',
  },
  outerRing1: {
    position: 'absolute',
    width: 152,
    height: 152,
    borderRadius: 76,
    borderWidth: 4,
    borderColor: 'rgba(180, 210, 240, 0.9)',
    backgroundColor: 'rgba(180, 210, 240, 0.3)',
  },
  innerCircle: {
    position: 'absolute',
    width: 145,
    height: 145,
    borderRadius: 72.5,
    backgroundColor: '#0b1b3d',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0b1b3d',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  activeText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2b5866',
    marginBottom: 8,
  },
  shakeText: {
    fontSize: 28,
    fontWeight: '900',
    color: '#0b1b3d',
    marginBottom: 10,
  },
  countdownText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0b1b3d',
  },
});
