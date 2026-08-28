import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/color';
import { useAuth } from '@/context/auth';
import { useBleContext } from '@/context/ble-context';
import React from 'react';
import { Dimensions, Modal, StyleSheet, Text, TouchableOpacity, useColorScheme, View } from 'react-native';

interface ArrivalAlertModalProps {
  visible: boolean;
  onClose: () => void;
  onStopAlarm: () => void;
}

export function ArrivalAlertModal({ visible, onClose, onStopAlarm }: ArrivalAlertModalProps) {
  const theme = useColorScheme() ?? 'light';
  const colors = Colors[theme as 'light' | 'dark'];
  const { sensorData } = useBleContext();
  const { user } = useAuth();

  const isCompleted = sensorData?.destinationAlarmCompleted === true;
  const shakeProgress = sensorData?.shakeProgressSec ?? 0;
  const requiredSeconds = sensorData?.wakeShakeSec ?? 3;
  const remainingSeconds = Math.max(0, Math.ceil(requiredSeconds - shakeProgress));

  // Calculate progress for UI styling (0 to 1)
  const progressPercent = Math.min(1, shakeProgress / requiredSeconds);

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: '#D4E6F1' }]}>
        
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <IconSymbol name="xmark" size={24} color="#0B2046" />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: '#0B2046' }]}>Arrival Alert</Text>
          <View style={{ width: 24 }} />
        </View>

        {isCompleted ? (
          <View style={styles.content}>
            <View style={[styles.successCircle, { backgroundColor: '#0B2046' }]}>
              <IconSymbol name="check-circle" size={80} color="#D6EAF8" />
            </View>
            <Text style={[styles.awakeText, { color: '#0B2046' }]}>Commute Monitoring Complete</Text>
            <Text style={[styles.subText, { color: '#0B2046' }]}>You have successfully arrived at your destination.</Text>

            <TouchableOpacity
              style={[styles.acknowledgeButton, { backgroundColor: '#0B2046' }]}
              onPress={onStopAlarm}
            >
              <Text style={styles.acknowledgeButtonText}>Acknowledge</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.content}>
            
            <View style={styles.circleWrapper}>
                {/* Outer concentric rings */}
                <View style={[styles.outerRing3, { transform: [{ scale: 1 + (progressPercent * 0.1) }] }]} />
                <View style={[styles.outerRing2, { transform: [{ scale: 1 + (progressPercent * 0.15) }] }]} />
                <View style={[styles.outerRing1, { transform: [{ scale: 1 + (progressPercent * 0.2) }] }]} />
                
                {/* Center Dark Blue Circle */}
                <View style={[styles.innerCircle, { backgroundColor: '#0B2046' }]}>
                  <Text style={styles.countdownText}>{remainingSeconds}s</Text>
                </View>
            </View>

            <Text style={[styles.shakeText, { color: '#0B2046' }]}>SHAKE TO STOP</Text>
            
          </View>
        )}
      </View>
    </Modal>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  closeButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 80,
  },
  circleWrapper: {
    width: 300,
    height: 300,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 60,
  },
  outerRing3: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(173, 216, 230, 0.2)', // Very light blue
  },
  outerRing2: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(173, 216, 230, 0.4)',
  },
  outerRing1: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 6,
    borderColor: 'rgba(173, 216, 230, 0.8)',
    backgroundColor: 'rgba(173, 216, 230, 0.2)',
  },
  innerCircle: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  countdownText: {
    fontSize: 48,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  shakeText: {
    fontSize: 42,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -1,
  },
  successCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
  },
  awakeText: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 15,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  subText: {
    fontSize: 16,
    opacity: 0.8,
    marginBottom: 40,
    textAlign: 'center',
    paddingHorizontal: 30,
  },
  acknowledgeButton: {
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 12,
  },
  acknowledgeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
});
