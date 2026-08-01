import { Buffer } from 'buffer';
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Alert, PermissionsAndroid, Platform } from 'react-native';
import { BleManager, Device } from 'react-native-ble-plx';
import { BagAlarmSettings } from '../utils/alarm-settings';
global.Buffer = global.Buffer || Buffer;

const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const WRITE_CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";
const NOTIFY_CHARACTERISTIC_UUID = "12345678-4321-4321-4321-123456789abc";

export interface SensorData {
  heartRate: number;
  spo2: number;
  fallDetected: boolean;
  latitude: number;
  longitude: number;
  destLat: number;
  destLng: number;
  triggerDistanceKm: number;
  distanceToDestinationKm: number;
  wakeShakeSec: number;
  sleeperType: number;
  shakeProgressSec: number;
  settingsReceived: boolean;
  destinationAlarmEnabled: boolean;
  destinationAlarmTriggered: boolean;
  destinationAlarmCompleted: boolean;
  stopLatched: boolean;
  alarmActive: boolean;
  antiTheftActive?: boolean;
  antiTheftType?: number;
  status: string;
}

interface BleContextType {
  connectedDevice: Device | null;
  isScanning: boolean;
  devices: Device[];
  startScan: () => Promise<void>;
  stopScan: () => void;
  connect: (device: Device) => Promise<void>;
  disconnect: () => Promise<void>;
  sendSettings: (settings: BagAlarmSettings) => Promise<boolean>;
  sendAntiTheftConfig: (reed: boolean, ldr: boolean, mpu: boolean, buzzer?: boolean) => Promise<boolean>;
  sendAntiTheftArmCommand: () => Promise<boolean>;
  sendAntiTheftDisarmCommand: () => Promise<boolean>;
  sendBuzzerToggle: (enabled: boolean) => Promise<boolean>;
  sendStopCommand: () => Promise<boolean>;
  sensorData: SensorData | null;
}

const BleContext = createContext<BleContextType | undefined>(undefined);
const bleManager = new BleManager();

const requestBluetoothPermissions = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return true;

  try {
    if (Platform.Version >= 31) {
      const permissions = [
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ];

      const granted = await PermissionsAndroid.requestMultiple(permissions);

      const bluetoothScanGranted = granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED;
      const bluetoothConnectGranted = granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED;

      if (!bluetoothScanGranted || !bluetoothConnectGranted) {
        Alert.alert('Permissions Required', 'Please enable Bluetooth permissions to scan for devices.');
        return false;
      }

      console.log('Bluetooth permissions granted');
      return true;
    } else if (Platform.Version >= 23) {
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
      return result === PermissionsAndroid.RESULTS.GRANTED;
    }
  } catch (error) {
    console.error('Permission request error:', error);
    return false;
  }
  return true;
};

const extractJsonObjects = (buffer: string): { parsedObjects: SensorData[], remaining: string } => {
  const parsedObjects: SensorData[] = [];
  let startIndex = buffer.indexOf('{');

  while (startIndex !== -1) {
    let braceCount = 0;
    let endIndex = -1;
    let inString = false;
    let escape = false;

    for (let i = startIndex; i < buffer.length; i++) {
      const char = buffer[i];

      if (escape) {
        escape = false;
        continue;
      }

      if (char === '\\') {
        escape = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
      }

      if (!inString) {
        if (char === '{') braceCount++;
        else if (char === '}') braceCount--;
      }

      if (braceCount === 0) {
        endIndex = i;
        break;
      }
    }

    if (endIndex !== -1) {
      const jsonStr = buffer.substring(startIndex, endIndex + 1);
      try {
        const parsed = JSON.parse(jsonStr) as SensorData;
        parsedObjects.push(parsed);
      } catch (e) {
        console.error("Failed to parse extracted JSON:", jsonStr, e);
      }
      buffer = buffer.substring(endIndex + 1);
      startIndex = buffer.indexOf('{');
    } else {
      break;
    }
  }

  if (startIndex === -1 && buffer.length > 2048) {
    return { parsedObjects, remaining: "" };
  }

  return { parsedObjects, remaining: buffer };
};

export const BleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [sensorData, setSensorData] = useState<SensorData | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataBufferRef = useRef<string>("");

  const stopScan = useCallback(() => {
    try {
      bleManager.stopDeviceScan();
    } catch (error) {
      console.warn('Stop scan error:', error);
    }
    setIsScanning(false);
    console.log('Scan stopped');
  }, []);

  const startScan = useCallback(async () => {
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
    }

    const hasPermission = await requestBluetoothPermissions();
    if (!hasPermission) {
      console.warn('Bluetooth permissions denied');
      return;
    }

    setIsScanning(true);
    setDevices([]);
    console.log('Starting BLE scan...');

    bleManager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.error('Scan error:', error.message);
        return;
      }

      if (device?.name) {
        console.log(`📱 Found device: ${device.name} (${device.id})`);
      }

      if (device?.name === 'Alerto_Hardware' || device?.localName === 'Alerto_Hardware') {
        console.log('MATCH! Found Alerto device:', device.name);

        setDevices(prevDevices => {
          const exists = prevDevices.some(d => d.id === device.id);
          if (!exists) {
            console.log('Adding device to list. Total:', prevDevices.length + 1);
            return [...prevDevices, device];
          }
          return prevDevices;
        });
      }
    });

    scanTimeoutRef.current = setTimeout(() => {
      stopScan();
    }, 15000);
  }, [stopScan]);

  const connect = useCallback(async (device: Device): Promise<void> => {
    try {
      console.log('🔗 Connecting to:', device.name);
      const connected = await bleManager.connectToDevice(device.id);
      
      if (Platform.OS === 'android') {
        await connected.requestMTU(512);
      }
      
      await connected.discoverAllServicesAndCharacteristics();
      setConnectedDevice(connected);
      console.log('Connected successfully to:', device.name);

      dataBufferRef.current = "";

      connected.monitorCharacteristicForService(
        SERVICE_UUID,
        NOTIFY_CHARACTERISTIC_UUID,
        (error, characteristic) => {
          if (error) {
            console.error("BLE Notify Error:", error);
            return;
          }
          if (characteristic?.value) {
            const decodedValue = Buffer.from(characteristic.value, 'base64').toString('ascii');
            dataBufferRef.current += decodedValue;

            const { parsedObjects, remaining } = extractJsonObjects(dataBufferRef.current);
            dataBufferRef.current = remaining;

            if (parsedObjects.length > 0) {
              setSensorData(parsedObjects[parsedObjects.length - 1]);
            }
          }
        }
      );
    } catch (error) {
      console.error('Connection error:', error);
      throw error;
    }
  }, []);

  const disconnect = useCallback(async (): Promise<void> => {
    if (connectedDevice) {
      try {
        await bleManager.cancelDeviceConnection(connectedDevice.id);
        setConnectedDevice(null);
        setSensorData(null);
        console.log('Disconnected');
      } catch (error) {
        console.error('Disconnect error:', error);
      }
    }
  }, [connectedDevice]);

  const sendSettings = useCallback(async (alarmSettings: BagAlarmSettings): Promise<boolean> => {
    if (!connectedDevice) {
      console.warn('No device connected');
      return false;
    }

    try {
      const payload = [
        alarmSettings.lat.toFixed(6),
        alarmSettings.lon.toFixed(6),
        String(alarmSettings.sleeperType),
        String(alarmSettings.wakeShakeSec),
        alarmSettings.triggerDistanceKm.toFixed(2),
      ].join(',');

      console.log('📡 Sending to BLE:', payload);

      await connectedDevice.writeCharacteristicWithResponseForService(
        SERVICE_UUID,
        WRITE_CHARACTERISTIC_UUID,
        Buffer.from(payload).toString('base64')
      );

      console.log('Settings sent successfully');
      return true;
    } catch (error) {
      console.error('Send settings error:', error);
      return false;
    }
  }, [connectedDevice]);

  const writeCommand = useCallback(async (command: string): Promise<boolean> => {
    if (!connectedDevice) {
      console.warn('No device connected');
      return false;
    }

    try {
      await connectedDevice.writeCharacteristicWithResponseForService(
        SERVICE_UUID,
        WRITE_CHARACTERISTIC_UUID,
        Buffer.from(command).toString('base64')
      );
      console.log('BLE command sent:', command);
      return true;
    } catch (error) {
      console.error('Send BLE command error:', error);
      return false;
    }
  }, [connectedDevice]);

  const sendAntiTheftConfig = useCallback((reed: boolean, ldr: boolean, mpu: boolean, buzzer?: boolean): Promise<boolean> => {
    const bParam = buzzer !== undefined ? `,${Number(buzzer)}` : '';
    return writeCommand(`AT:CONFIG:${Number(reed)},${Number(ldr)},${Number(mpu)}${bParam}`);
  }, [writeCommand]);

  const sendAntiTheftArmCommand = useCallback((): Promise<boolean> => {
    return writeCommand('AT:ARM');
  }, [writeCommand]);

  const sendAntiTheftDisarmCommand = useCallback((): Promise<boolean> => {
    return writeCommand('AT:DISARM');
  }, [writeCommand]);

  const sendBuzzerToggle = useCallback((enabled: boolean): Promise<boolean> => {
    return writeCommand(enabled ? 'BUZZER_ON' : 'BUZZER_OFF');
  }, [writeCommand]);

  const sendStopCommand = useCallback(async (): Promise<boolean> => {
    return writeCommand('STOP');
  }, [writeCommand]);

  const value = useMemo(() => {
    console.log('BLE Context updated. Devices:', devices.length, 'Connected:', !!connectedDevice);
    return {
      connectedDevice,
      isScanning,
      devices,
      startScan,
      stopScan,
      connect,
      disconnect,
      sendSettings,
      sendAntiTheftConfig,
      sendAntiTheftArmCommand,
      sendAntiTheftDisarmCommand,
      sendBuzzerToggle,
      sendStopCommand,
      sensorData,
    };
  }, [connectedDevice, isScanning, devices, startScan, stopScan, connect, disconnect, sendSettings, sendAntiTheftConfig, sendAntiTheftArmCommand, sendAntiTheftDisarmCommand, sendBuzzerToggle, sendStopCommand, sensorData]);

  return (
    <BleContext.Provider value={value}>
      {children}
    </BleContext.Provider>
  );
};

export const useBleContext = () => {
  const context = useContext(BleContext);
  if (!context) {
    throw new Error('useBleContext must be used within BleProvider');
  }
  return context;
};
