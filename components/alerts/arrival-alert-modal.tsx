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

  const firstName = user?.name ? user.name.split(' ')[0] : 'User';

  const isCompleted = sensorData?.destinationAlarmCompleted === true;
  const shakeProgress = sensorData?.shakeProgressSec ?? 0;
  const requiredSeconds = sensorData?.wakeShakeSec ?? 3;
  const remainingSeconds = Math.max(0, requiredSeconds - Math.floor(shakeProgress));

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: '#D6EAF8' }]}>

        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <IconSymbol name="xmark" size={24} color="#0B2046" />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: '#0B2046' }]}>Wake-up Alert</Text>
          <View style={{ width: 24 }} />
        </View>

        {isCompleted ? (

          <View style={styles.content}>
            <View style={[styles.successCircle, { backgroundColor: '#0B2046' }]}>
              <IconSymbol name="check-circle" size={80} color="#D6EAF8" />
            </View>
            <Text style={[styles.awakeText, { color: '#0B2046' }]}>{`${firstName}'s Awake!`}</Text>
            <Text style={[styles.subText, { color: '#0B2046' }]}>Wake-up alert successfully deactivated.</Text>

            <TouchableOpacity
              style={[styles.acknowledgeButton, { backgroundColor: '#0B2046' }]}
              onPress={onStopAlarm}
            >
              <Text style={styles.acknowledgeButtonText}>Acknowledge</Text>
            </TouchableOpacity>
          </View>
        ) : (

          <View style={styles.content}>
            <View style={styles.vibrationRings}>
              <View style={[styles.vibrationIconContainer, { backgroundColor: '#0B2046' }]}>
                <IconSymbol name="pulse" size={60} color="#fff" />
              </View>
            </View>

            <Text style={[styles.vibrationText, { color: '#4A8A8B' }]}>Vibration Active</Text>

            <View style={styles.handImageContainer}>
              <IconSymbol name="hand.raised.fill" size={100} color="#63B3B5" />
            </View>

            <Text style={[styles.shakeText, { color: '#0B2046' }]}>SHAKE TO STOP</Text>

            <View style={[styles.countdownCircle, { borderColor: '#4A8A8B' }]}>
              <Text style={[styles.countdownText, { color: '#0B2046' }]}>{remainingSeconds}s</Text>
            </View>
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
    fontSize: 18,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60,
  },
  vibrationRings: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 20,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  vibrationIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vibrationText: {
    fontSize: 28,
    fontWeight: '700',
    marginTop: 20,
    marginBottom: 40,
  },
  handImageContainer: {
    width: width * 0.7,
    height: width * 0.7,
    backgroundColor: '#9EC9C5',
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  shakeText: {
    fontSize: 36,
    fontWeight: '900',
    marginBottom: 20,
  },
  countdownCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownText: {
    fontSize: 28,
    fontWeight: '800',
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
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 10,
  },
  subText: {
    fontSize: 18,
    opacity: 0.8,
    marginBottom: 40,
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
