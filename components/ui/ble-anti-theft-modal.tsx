import React, { useEffect, useRef } from 'react';
import { Animated, FlatList, Modal, Platform, StyleSheet, Text, TouchableOpacity, useColorScheme, View, ActivityIndicator } from 'react-native';
import { Device } from 'react-native-ble-plx';
import { Colors } from '@/constants/color';
import { IconSymbol } from './icon-symbol';

interface BleAntiTheftModalProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly devices: Device[];
  readonly isScanning: boolean;
  readonly onConnect: (device: Device) => Promise<void>;
  readonly onEnableSimulation: () => void;
  readonly isSimulated: boolean;
}

export function BleAntiTheftModal({
  visible,
  onClose,
  devices,
  isScanning,
  onConnect,
  onEnableSimulation,
  isSimulated,
}: BleAntiTheftModalProps) {
  const theme = useColorScheme() ?? 'light';
  const colors = Colors[theme as 'light' | 'dark'];

  // Pulse animation for scan indicator
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;
    if (isScanning && visible) {
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.3,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
    } else {
      pulseAnim.setValue(1);
    }

    return () => {
      if (animation) {
        animation.stop();
      }
    };
  }, [isScanning, visible, pulseAnim]);

  const handleSimulateSelect = () => {
    onEnableSimulation();
    const simulatedDevice = {
      id: 'MOCK-ALERTO-BAGTAG-ID',
      name: 'Alerto BagTag (Simulated)',
    } as Device;
    void onConnect(simulatedDevice);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: theme === 'dark' ? '#151c33' : '#ffffff', borderColor: colors.hr }]}>
          
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.mainText }]}>Pair Anti-Theft Tag</Text>
            <TouchableOpacity onPress={onClose} style={[styles.closeIconButton, { backgroundColor: colors.card }]}>
              <IconSymbol name="close" size={20} color={colors.icon} />
            </TouchableOpacity>
          </View>

          {/* Scanner Pulse Indicator */}
          {isScanning && (
            <View style={styles.scannerWrapper}>
              <Animated.View
                style={[
                  styles.pulseCircle,
                  {
                    borderColor: colors.brand,
                    transform: [{ scale: pulseAnim }],
                  },
                ]}
              />
              <View style={[styles.radarCenter, { backgroundColor: colors.brand }]}>
                <IconSymbol name="bluetooth" size={28} color="#ffffff" />
              </View>
              <Text style={[styles.statusText, { color: colors.subtitle }]}>Scanning for Alerto Bag Tags nearby...</Text>
              <ActivityIndicator size="small" color={colors.brand} style={{ marginTop: 8 }} />
            </View>
          )}

          {/* Devices List */}
          <View style={styles.listContainer}>
            <Text style={[styles.sectionLabel, { color: colors.subtitle }]}>
              Discovered Devices ({devices.length})
            </Text>

            {devices.length === 0 ? (
              <View style={[styles.emptyContainer, { backgroundColor: colors.card }]}>
                <IconSymbol name="shield-off-outline" size={32} color={colors.subtitle} />
                <Text style={[styles.emptyText, { color: colors.subtitle }]}>
                  {isScanning ? "Scanning..." : "No Alerto Bag Tags found. Make sure your hardware is powered on and within Bluetooth range."}
                </Text>
              </View>
            ) : (
              <FlatList
                data={devices}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => {
                  const isMock = item.id === 'MOCK-ALERTO-BAGTAG-ID';
                  return (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={async () => {
                        await onConnect(item);
                        onClose();
                      }}
                      style={[
                        styles.deviceItem,
                        {
                          backgroundColor: colors.card,
                          borderColor: colors.hr,
                        },
                      ]}
                    >
                      <View style={[styles.deviceIconBox, { backgroundColor: isMock ? colors.watchEsp : colors.dangerBg }]}>
                        <IconSymbol
                          name={isMock ? "laptop" : "bluetooth-connect"}
                          size={18}
                          color={isMock ? colors.lightning : colors.brand}
                        />
                      </View>
                      <View style={styles.deviceDetails}>
                        <Text style={[styles.deviceName, { color: colors.mainText }]}>
                          {item.name || 'Unknown Device'}
                        </Text>
                        <Text style={[styles.deviceId, { color: colors.subtitle }]}>
                          ID: {item.id}
                        </Text>
                      </View>
                      <IconSymbol name="chevron.right" size={20} color={colors.icon} />
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>

          {/* Footer - Options */}
          <View style={[styles.footer, { borderTopColor: colors.hr }]}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleSimulateSelect}
              style={[styles.simButton, { backgroundColor: colors.watchEsp, borderColor: colors.lightning }]}
            >
              <IconSymbol name="play" size={16} color={colors.lightning} style={{ marginRight: 8 }} />
              <Text style={[styles.simButtonText, { color: colors.lightning }]}>
                Run BLE Simulator (No Hardware)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={onClose}
              style={[styles.cancelButton, { backgroundColor: colors.buttonBackground }]}
            >
              <Text style={[styles.cancelButtonText, { color: colors.mainText }]}>Cancel</Text>
            </TouchableOpacity>
          </View>

        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    padding: 24,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  closeIconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannerWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    marginBottom: 20,
  },
  pulseCircle: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    opacity: 0.4,
  },
  radarCenter: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 16,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  listContainer: {
    flex: 1,
    minHeight: 180,
    maxHeight: 280,
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  emptyContainer: {
    flex: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  listContent: {
    paddingBottom: 8,
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  deviceIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  deviceDetails: {
    flex: 1,
  },
  deviceName: {
    fontSize: 15,
    fontWeight: '600',
  },
  deviceId: {
    fontSize: 12,
    marginTop: 2,
  },
  footer: {
    borderTopWidth: 1,
    paddingTop: 16,
  },
  simButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 10,
  },
  simButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  cancelButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
