import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/color';
import React from 'react';
import { FlatList, Modal, StyleSheet, Text, TouchableOpacity, View, useColorScheme, ActivityIndicator } from 'react-native';
import { Device } from 'react-native-ble-plx';

interface BleDeviceModalProps {
  visible: boolean;
  onClose: () => void;
  devices: Device[];
  isScanning: boolean;
  onConnect: (device: Device) => void;
}

export function BleDeviceModal({ visible, onClose, devices, isScanning, onConnect }: BleDeviceModalProps) {
  const theme = useColorScheme() ?? 'light';
  const colors = Colors[theme as 'light' | 'dark'];

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: colors.card }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>Pair Wearable</Text>
          </View>

          {isScanning && (
            <View style={styles.scanningContainer}>
              <ActivityIndicator color={colors.activeCard} size="small" />
              <Text style={[styles.scanningText, { color: colors.subtitle }]}>Scanning for devices...</Text>
            </View>
          )}

          <FlatList
            data={devices}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={
              !isScanning ? (
                <Text style={[styles.emptyText, { color: colors.subtitle }]}>No devices found. Make sure your wearable is nearby.</Text>
              ) : null
            }
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={[styles.deviceItem, { borderBottomColor: colors.hr }]}
                onPress={() => onConnect(item)}
              >
                <View style={[styles.iconBox, { backgroundColor: colors.activeCard + '20' }]}>
                  <IconSymbol name="applewatch" size={20} color={colors.activeCard} />
                </View>
                <View style={styles.deviceInfo}>
                   <Text style={[styles.deviceName, { color: colors.text }]}>{item.name || 'Unknown Device'}</Text>
                   <Text style={[styles.deviceId, { color: colors.subtitle }]}>{item.id}</Text>
                </View>
                <IconSymbol name="chevron.right" size={16} color={colors.subtitle} />
              </TouchableOpacity>
            )}
          />

          <View style={styles.buttonContainer}>
            <TouchableOpacity 
              style={[styles.closeButton, { borderColor: colors.hr }]} 
              onPress={onClose}
            >
              <Text style={[styles.closeButtonText, { color: colors.subtitle }]}>Close</Text>
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
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  container: {
    width: '100%',
    maxHeight: '60%',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold'
  },
  scanningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    gap: 10
  },
  scanningText: {
    fontSize: 14
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15
  },
  deviceInfo: {
    flex: 1
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '600'
  },
  deviceId: {
    fontSize: 12,
    marginTop: 2
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 20
  },
  buttonContainer: {
    marginTop: 20,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%'
  },
  closeButton: {
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center'
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600'
  }
});
