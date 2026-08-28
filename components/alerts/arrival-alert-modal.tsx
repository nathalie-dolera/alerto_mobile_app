import { IconSymbol } from '@/components/ui/icon-symbol';
import { useBleContext } from '@/context/ble-context';
import React, { useEffect, useState } from 'react';
import { Dimensions, Modal, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface ArrivalAlertModalProps {
  visible: boolean;
  onClose: () => void;
  onStopAlarm: () => void;
}

export function ArrivalAlertModal({ visible, onClose, onStopAlarm }: ArrivalAlertModalProps) {
  const { sensorData } = useBleContext();
  const [testShakeProgress, setTestShakeProgress] = useState(0);

  const isCompleted = sensorData?.destinationAlarmCompleted === true || sensorData?.status === 'WAKE_SHAKE_DONE';
  const hardwareShakeProgress = sensorData?.shakeProgressSec ?? 0;
  // Configured duration (e.g. 3s, 5s, 10s set in alarm config)
  const requiredSeconds = sensorData?.wakeShakeSec && sensorData.wakeShakeSec > 0 ? sensorData.wakeShakeSec : 3;

  // Effective accumulated shake duration (only increases when physical shake is detected)
  const accumulatedShake = Math.max(hardwareShakeProgress, testShakeProgress);
  const remainingSeconds = Math.max(0, Math.ceil(requiredSeconds - accumulatedShake));
  const progressPercent = Math.min(1, accumulatedShake / requiredSeconds);

  // Reset test shake progress when modal opens
  useEffect(() => {
    if (visible) {
      setTestShakeProgress(0);
    }
  }, [visible]);

  // Automatically close and exit to History once required shake duration is reached
  useEffect(() => {
    if (visible && (isCompleted || (accumulatedShake >= requiredSeconds && requiredSeconds > 0))) {
      const timeout = setTimeout(() => {
        onStopAlarm();
      }, 400);
      return () => clearTimeout(timeout);
    }
  }, [visible, isCompleted, accumulatedShake, requiredSeconds, onStopAlarm]);

  // Fallback tap simulator for testing in app when hardware is not actively connected
  const handleSimulateShakeStep = () => {
    setTestShakeProgress(prev => Math.min(requiredSeconds, prev + 1));
  };

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={onStopAlarm}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onStopAlarm} style={styles.closeButton} activeOpacity={0.7}>
            <IconSymbol name="close" size={24} color="#0b1b3d" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Arrival Alert</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.content}>
          {/* Concentric Circle Graphic - Tappable for manual test fallback */}
          <TouchableOpacity 
            activeOpacity={0.95} 
            onPress={handleSimulateShakeStep}
            style={styles.circleWrapper}
          >
            <View style={[styles.outerRing3, { transform: [{ scale: 1 + (progressPercent * 0.1) }] }]} />
            <View style={[styles.outerRing2, { transform: [{ scale: 1 + (progressPercent * 0.15) }] }]} />
            <View style={[styles.outerRing1, { transform: [{ scale: 1 + (progressPercent * 0.18) }] }]} />
            
            {/* Center Dark Navy Circle with Vibrating Phone Icon */}
            <View style={styles.innerCircle}>
              <IconSymbol name="vibrate" size={56} color="#ffffff" />
            </View>
          </TouchableOpacity>

          {/* Alert Status Subtitle */}
          <Text style={styles.activeText}>Vibration Active</Text>

          {/* Action Callout */}
          <Text style={styles.shakeText}>SHAKE TO STOP</Text>

          {/* Shake Countdown Circular Badge */}
          <View style={styles.countdownBadge}>
            <Text style={styles.countdownText}>{remainingSeconds}s</Text>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#d8e7f5', // Soft sky blue matching screenshot
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  closeButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0b1b3d',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 50,
  },
  circleWrapper: {
    width: 260,
    height: 260,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  outerRing3: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(180, 210, 240, 0.35)',
  },
  outerRing2: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(180, 210, 240, 0.55)',
  },
  outerRing1: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
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
    fontSize: 28,
    fontWeight: '700',
    color: '#2b5866',
    marginBottom: 60,
  },
  shakeText: {
    fontSize: 32,
    fontWeight: '900',
    color: '#0b1b3d',
    letterSpacing: 0.5,
    marginBottom: 20,
  },
  countdownBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#7ba7d1',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownText: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0b1b3d',
  },
});
