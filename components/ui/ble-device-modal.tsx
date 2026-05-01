import React from 'react';
import { FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Device } from 'react-native-ble-plx';

interface BleDeviceModalProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly devices: Device[];
  readonly isScanning: boolean;
  readonly onConnect: (device: Device) => Promise<void>;
}

export function BleDeviceModal({ 
  visible, 
  onClose, 
  devices, 
  isScanning, 
  onConnect 
}: BleDeviceModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <Text style={styles.title}>Pair Wearable</Text>

          {isScanning && <Text style={styles.scanningText}>🔍 Scanning...</Text>}

          {devices.length === 0 ? (
            <Text style={styles.noDevicesText}>
              No devices found. Make sure your wearable is nearby.
            </Text>
          ) : (
            <FlatList
              data={devices}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  onPress={() => onConnect(item)}
                  style={styles.deviceItem}
                >
                  <Text style={styles.deviceName}>{item.name || 'Unknown Device'}</Text>
                </TouchableOpacity>
              )}
            />
          )}

          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>Close</Text>
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
    backgroundColor: 'white',
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
    color: '#666',
    marginBottom: 15,
  },
  deviceItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  deviceName: {
    fontSize: 16,
  },
  closeButton: {
    marginTop: 15,
    padding: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
