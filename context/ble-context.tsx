import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { BleManager, Device } from 'react-native-ble-plx';

interface BleContextType {
  connectedDevice: Device | null;
  isScanning: boolean;
  isBluetoothEnabled: boolean;
  startScan: () => void;
  stopScan: () => void;
  connectToDevice: (device: Device) => Promise<void>;
  disconnectDevice: () => Promise<void>;
  syncAlarmConfig: (config: any) => Promise<boolean>;
  scannedDevices: Device[];
}

const BleContext = createContext<BleContextType | undefined>(undefined);

//standard ESP32
const SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';
const CHARACTERISTIC_UUID = '0000ffe1-0000-1000-8000-00805f9b34fb';

export const BleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [manager, setManager] = useState<BleManager | null>(null);
  
  useEffect(() => {
    try {
        const m = new BleManager();
        setManager(m);
    } catch (e) {
    }
  }, []);

  const [isScanning, setIsScanning] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [scannedDevices, setScannedDevices] = useState<Device[]>([]);
  const [isBluetoothEnabled, setIsBluetoothEnabled] = useState(false);
  
  const autoReconnectRef = useRef(true);

  //check Bluetooth State
  useEffect(() => {
    if (!manager) return;
    const subscription = manager.onStateChange((state) => {
      setIsBluetoothEnabled(state === 'PoweredOn');
      if (state === 'PoweredOn') {
        checkLastDevice();
      }
    }, true);
    return () => subscription.remove();
  }, [manager]);

  const checkLastDevice = async () => {
    try {
      const lastId = await AsyncStorage.getItem('alerto_last_device_id');
      if (lastId && !connectedDevice && manager) {
        console.log('Found last device ID, attempting auto-reconnect:', lastId);
        const device = await manager.connectToDevice(lastId);
        await handleDeviceConnection(device);
      }
    } catch (e) {
      console.log('No previous device to reconnect.');
    }
  };

  const startScan = () => {
    if (!isBluetoothEnabled || !manager) {
      Alert.alert('Hardware Unavailable', 'BLE is not supported on this device/emulator or the library is not installed.');
      return;
    }

    setIsScanning(true);
    setScannedDevices([]);
    manager?.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.error('Scan Error:', error);
        setIsScanning(false);
        return;
      }
      if (device && device.name && (device.name.includes('ALERTO') || device.name.includes('ESP32'))) {
        setScannedDevices((prev) => {
          const exists = prev.find((d) => d.id === device.id);
          if (exists) return prev;
          return [...prev, device];
        });
      }
    });

    //auto-stop scan after 10 seconds
    setTimeout(() => stopScan(), 10000);
  };

  const stopScan = () => {
    manager?.stopDeviceScan();
    setIsScanning(false);
  };

  const handleDeviceConnection = async (device: Device) => {
    try {
      const connected = await device.isConnected();
      if (!connected) {
          await device.connect();
      }
      await device.discoverAllServicesAndCharacteristics();
      
      setConnectedDevice(device);
      await AsyncStorage.setItem('alerto_last_device_id', device.id);
      
      device.onDisconnected((error, disconnectedDevice) => {
        setConnectedDevice(null);
        if (autoReconnectRef.current) {
            checkLastDevice();
        }
      });
      
      console.log('Connected to device:', device.name);
    } catch (e) {
      console.error('Connection logic error:', e);
    }
  };

  const connectToDevice = async (device: Device) => {
    stopScan();
    try {
      await handleDeviceConnection(device);
    } catch (e) {
      Alert.alert('Connection Failed', 'Could not connect to the device.');
    }
  };

  const disconnectDevice = async () => {
    autoReconnectRef.current = false;
    if (connectedDevice) {
      await connectedDevice.cancelConnection();
      await AsyncStorage.removeItem('alerto_last_device_id');
    }
    setConnectedDevice(null);
    autoReconnectRef.current = true;
  };

  const syncAlarmConfig = async (config: any): Promise<boolean> => {
    if (!connectedDevice) {
        console.log('No wearable connected, skipping hardware sync.');
        return false;
    }

    try {
      const jsonString = JSON.stringify(config);
      //encoding to Base64
      const base64Data = btoa(jsonString);
      
      await connectedDevice.writeCharacteristicWithResponseForService(
        SERVICE_UUID,
        CHARACTERISTIC_UUID,
        base64Data
      );
      
      console.log('Sync successful:', jsonString);
      return true;
    } catch (e) {
      console.error('Sync Error:', e);
      return false;
    }
  };

  return (
    <BleContext.Provider value={{
      connectedDevice, isScanning, isBluetoothEnabled, 
      startScan, stopScan, connectToDevice, disconnectDevice,
      syncAlarmConfig, scannedDevices
    }}>
      {children}
    </BleContext.Provider>
  );
};

export const useBleContext = () => {
  const context = useContext(BleContext);
  if (!context) throw new Error('useBleContext must be used within a BleProvider');
  return context;
};
