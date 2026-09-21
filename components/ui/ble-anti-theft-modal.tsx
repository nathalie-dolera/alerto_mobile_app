import React from 'react';
import { FlatList, Modal, StyleSheet, Text, TouchableOpacity, useColorScheme, View } from 'react-native';
import { Device } from 'react-native-ble-plx';
import { Colors } from '@/constants/color';

interface BleAntiTheftModalProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly devices: Device[];
  readonly isScanning: boolean;
  readonly onConnect: (device: Device) => Promise<void>;
}

export function BleAntiTheftModal({
  visible,
  onClose,
  devices,
  isScanning,
  onConnect,
}: BleAntiTheftModalProps) {
  const theme = useColorScheme() ?? 'light';
  const colors = Colors[theme as 'light' | 'dark'];

  const handleDeviceConnect = async (device: Device) => {
    try {
      await onConnect(device);
      onClose();
    } catch (error) {
      console.error('Failed to connect to device:', error);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <View style={[styles.modalContent, { backgroundColor: theme === 'dark' ? '#1e2123' : '#ffffff' }]}>
          <Text style={[styles.title, { color: colors.mainText }]}>Pair Module</Text>

          {isScanning && (
            <Text style={[styles.scanningText, { color: colors.subtitle }]}>🔍 Scanning...</Text>
          )}

          {devices.length === 0 ? (
            <Text style={[styles.noDevicesText, { color: colors.subtitle }]}>
              No devices found. Make sure your module is nearby.
            </Text>
          ) : (
            <FlatList
              data={devices}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => handleDeviceConnect(item)}
                  style={[styles.deviceItem, { borderBottomColor: colors.hr }]}
                >
                  <Text style={[styles.deviceName, { color: colors.mainText }]}>
                    {item.name || 'Unknown Device'}
                  </Text>
                </TouchableOpacity>
              )}
            />
          )}

          <TouchableOpacity
            onPress={onClose}
            style={[styles.closeButton, { backgroundColor: theme === 'dark' ? '#2a2f38' : '#f0f0f0' }]}
          >
            <Text style={[styles.closeButtonText, { color: colors.mainText }]}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  scanningText: {
    fontSize: 14,
    marginBottom: 10,
  },
  noDevicesText: {
    fontSize: 14,
    marginBottom: 15,
  },
  deviceItem: {
    padding: 15,
    borderBottomWidth: 1,
  },
  deviceName: {
    fontSize: 16,
  },
  closeButton: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
