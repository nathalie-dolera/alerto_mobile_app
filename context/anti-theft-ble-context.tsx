import { Buffer } from 'buffer';
import React, { createContext, useCallback, useContext, useMemo, useRef, useState, useEffect } from 'react';
import { Alert, PermissionsAndroid, Platform } from 'react-native';
import { BleManager, Device } from 'react-native-ble-plx';
import { BLE_SERVICE_UUID, BLE_CHARACTERISTIC_UUID, ALERT_TYPES } from '../constants/ble-anti-theft';

// Polyfill Buffer globally if not already done
global.Buffer = global.Buffer || Buffer;

export type ConnectionStatus = 'disconnected' | 'scanning' | 'connecting' | 'connected' | 'armed' | 'calibrating';

interface AntiTheftBleContextType {
  connectedDevice: Device | null;
  connectionStatus: ConnectionStatus;
  isScanning: boolean;
  devices: Device[];
  isSimulated: boolean;
  
  // Sensor safety states
  reedSafe: boolean;
  ldrSafe: boolean;
  mpuSafe: boolean;
  
  // Enabled sensors config (local state)
  enableReed: boolean;
  enableLdr: boolean;
  enableMpu: boolean;
  
  // Alarm trigger
  isAlerting: boolean;
  alertType: number | null; // 1 = Bag Open, 2 = Light, 3 = Motion
  
  // Actions
  startScan: () => Promise<void>;
  stopScan: () => void;
  connect: (device: Device) => Promise<void>;
  disconnect: () => Promise<void>;
  armSystem: (enableReed: boolean, enableLdr: boolean, enableMpu: boolean) => Promise<boolean>;
  disarmSystem: () => Promise<boolean>;
  dismissAlarm: () => void;
  
  // Sensor enables config setters
  setEnableReed: (val: boolean) => void;
  setEnableLdr: (val: boolean) => void;
  setEnableMpu: (val: boolean) => void;

  // Simulator helper
  enableSimulation: () => void;
  triggerSimulatedAlert: (type: number) => void;
}

const AntiTheftBleContext = createContext<AntiTheftBleContextType | undefined>(undefined);

// Instantiate BleManager safely
let bleManagerInstance: BleManager | null = null;
const getBleManager = (): BleManager => {
  if (!bleManagerInstance) {
    bleManagerInstance = new BleManager();
  }
  return bleManagerInstance;
};

// Android Location & Bluetooth Permissions Request helper
const requestBlePermissions = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') return true;

  try {
    if (Platform.Version >= 31) {
      const permissions = [
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ];

      const granted = await PermissionsAndroid.requestMultiple(permissions);

      const scanGranted = granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED;
      const connectGranted = granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED;
      const locationGranted = granted[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;

      if (!scanGranted || !connectGranted || !locationGranted) {
        Alert.alert(
          'Bluetooth Permissions Required',
          'Please allow Alerto to scan and connect to Bluetooth devices and access your location to discover the Bag Tag.'
        );
        return false;
      }
      return true;
    } else {
      const locationGranted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      return locationGranted === PermissionsAndroid.RESULTS.GRANTED;
    }
  } catch (error) {
    console.error('BLE Permission Request Error:', error);
    return false;
  }
};

export const AntiTheftBleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [isSimulated, setIsSimulated] = useState(false);

  // Sensor safety states
  const [reedSafe, setReedSafe] = useState(true);
  const [ldrSafe, setLdrSafe] = useState(true);
  const [mpuSafe, setMpuSafe] = useState(true);

  // Local config states
  const [enableReed, setEnableReed] = useState(true);
  const [enableLdr, setEnableLdr] = useState(true);
  const [enableMpu, setEnableMpu] = useState(true);

  // Active alarm alerting state
  const [isAlerting, setIsAlerting] = useState(false);
  const [alertType, setAlertType] = useState<number | null>(null);

  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const simulationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stop scanning helper
  const stopScan = useCallback(() => {
    try {
      getBleManager().stopDeviceScan();
    } catch (e) {
      console.warn('Stop scan error:', e);
    }
    setIsScanning(false);
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }
    console.log('Anti-Theft BLE Scan stopped');
  }, []);

  // Start BLE Scan
  const startScan = useCallback(async () => {
    const hasPerm = await requestBlePermissions();
    if (!hasPerm) {
      console.warn('BLE permissions denied');
      return;
    }

    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
    }

    setIsScanning(true);
    setDevices([]);
    setConnectionStatus('scanning');
    console.log('Starting Anti-Theft BLE Scan...');

    // If simulating, add a simulated device immediately for testing convenience
    if (isSimulated || Platform.OS === 'web') {
      const mockDevice = {
        id: 'MOCK-ALERTO-BAGTAG-ID',
        name: 'Alerto BagTag (Simulated)',
        localName: 'Alerto BagTag (Simulated)',
      } as unknown as Device;
      
      setTimeout(() => {
        setDevices([mockDevice]);
      }, 800);
    }

    getBleManager().startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.error('BLE Scan Error:', error.message);
        setIsScanning(false);
        setConnectionStatus('disconnected');
        return;
      }

      if (device) {
        const deviceName = device.name || device.localName || '';
        const lowerName = deviceName.toLowerCase();
        
        // Explicitly target Alerto Bag Tag and Alerto Wearable device names
        const isAlertoTarget = lowerName === 'alerto_bag_tag' || 
                               lowerName === 'alerto_wearable' || 
                               lowerName.includes('alerto') || 
                               lowerName.includes('bagtag') || 
                               lowerName.includes('tag');
        
        const isEsp32 = lowerName.includes('esp32') || lowerName.includes('receiver') || lowerName.includes('sender');

        if (isAlertoTarget || isEsp32) {
          setDevices((prev) => {
            if (prev.some((d) => d.id === device.id)) return prev;
            return [...prev, device];
          });
        }
      }
    });

    scanTimeoutRef.current = setTimeout(() => {
      stopScan();
      if (connectionStatus === 'scanning') {
        setConnectionStatus('disconnected');
      }
    }, 15000);
  }, [stopScan, isSimulated, connectionStatus]);

  // Connect to Device
  const connect = useCallback(async (device: Device): Promise<void> => {
    stopScan();
    setConnectionStatus('connecting');
    console.log(`🔗 Connecting to anti-theft Bag Tag: ${device.name || device.id}`);

    if (device.id === 'MOCK-ALERTO-BAGTAG-ID') {
      // Handle simulated connection
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setIsSimulated(true);
      setConnectedDevice(device);
      setConnectionStatus('connected');
      console.log('Connected successfully to Mock Bag Tag!');
      return;
    }

    try {
      const manager = getBleManager();
      const connected = await manager.connectToDevice(device.id);
      await connected.discoverAllServicesAndCharacteristics();
      setConnectedDevice(connected);
      setConnectionStatus('connected');
      setIsSimulated(false);
      console.log('Connected successfully to:', device.name);

      // Subscribe/Monitor notifications from the Bag Tag
      connected.monitorCharacteristicForService(
        BLE_SERVICE_UUID,
        BLE_CHARACTERISTIC_UUID,
        (error, characteristic) => {
          if (error) {
            console.error('BLE notification monitor error:', error);
            return;
          }

          if (characteristic?.value) {
            // Decode base64 notification payload
            const rawMessage = Buffer.from(characteristic.value, 'base64').toString('ascii');
            console.log('📡 BLE Alert Notification Received:', rawMessage);

            const cleaned = rawMessage.trim();
            
            // Check for Alert format: "ALERT:1", "ALERT:2", "ALERT:3" or "ALERT:BAG_OPEN", etc.
            if (cleaned.startsWith('ALERT:')) {
              const parts = cleaned.split(':');
              const alertVal = parts[1];

              setIsAlerting(true);

              if (alertVal === '1' || alertVal === 'BAG_OPEN') {
                setReedSafe(false);
                setAlertType(ALERT_TYPES.BAG_OPEN);
              } else if (alertVal === '2' || alertVal === 'LIGHT_INTRUSION') {
                setLdrSafe(false);
                setAlertType(ALERT_TYPES.LIGHT_INTRUSION);
              } else if (alertVal === '3' || alertVal === 'MOTION_ALERT') {
                setMpuSafe(false);
                setAlertType(ALERT_TYPES.MOTION_ALERT);
              }
            } else if (cleaned.startsWith('STATUS:')) {
              // Parse Bag Tag status updates (e.g. STATUS:CALIBRATING, STATUS:MONITORING, STATUS:SAFE)
              const statusVal = cleaned.split(':')[1];
              if (statusVal === 'CALIBRATING') {
                setConnectionStatus('calibrating');
              } else if (statusVal === 'MONITORING') {
                setConnectionStatus('armed');
              } else if (statusVal === 'DISARMED') {
                setConnectionStatus('connected');
              } else if (statusVal === 'SAFE') {
                setReedSafe(true);
                setLdrSafe(true);
                setMpuSafe(true);
                setIsAlerting(false);
                setAlertType(null);
              }
            }
          }
        }
      );
    } catch (e) {
      console.error('BLE connection failed:', e);
      setConnectionStatus('disconnected');
      setConnectedDevice(null);
      throw e;
    }
  }, [stopScan]);

  // Disconnect from Device
  const disconnect = useCallback(async (): Promise<void> => {
    if (isSimulated) {
      setConnectedDevice(null);
      setConnectionStatus('disconnected');
      setIsSimulated(false);
      setIsAlerting(false);
      setAlertType(null);
      setReedSafe(true);
      setLdrSafe(true);
      setMpuSafe(true);
      console.log('Mock device disconnected');
      return;
    }

    if (connectedDevice) {
      try {
        console.log('Cancelling BLE device connection:', connectedDevice.id);
        await getBleManager().cancelDeviceConnection(connectedDevice.id);
      } catch (e) {
        console.warn('BLE disconnect error:', e);
      }
      setConnectedDevice(null);
      setConnectionStatus('disconnected');
      setIsAlerting(false);
      setAlertType(null);
      setReedSafe(true);
      setLdrSafe(true);
      setMpuSafe(true);
      console.log('BLE Device disconnected successfully');
    }
  }, [connectedDevice, isSimulated]);

  // Arm System: CONFIG:r,l,m then ARM
  const armSystem = useCallback(async (reed: boolean, ldr: boolean, mpu: boolean): Promise<boolean> => {
    const configCommand = `CONFIG:${Number(reed)},${Number(ldr)},${Number(mpu)}`;
    console.log(`Sending Arm config settings: "${configCommand}"`);

    if (isSimulated) {
      setConnectionStatus('calibrating');
      
      // Simulate Calibration: 3 second delay, then arm monitoring
      if (simulationTimeoutRef.current) clearTimeout(simulationTimeoutRef.current);
      simulationTimeoutRef.current = setTimeout(() => {
        setConnectionStatus('armed');
        console.log('Simulated System Armed & Calibrated!');
      }, 3000);
      return true;
    }

    if (!connectedDevice) {
      console.warn('Cannot arm: No device connected');
      return false;
    }

    try {
      // 1. Send CONFIG command
      console.log(`Writing configuration over BLE: "${configCommand}"`);
      await connectedDevice.writeCharacteristicWithResponseForService(
        BLE_SERVICE_UUID,
        BLE_CHARACTERISTIC_UUID,
        Buffer.from(configCommand).toString('base64')
      );

      // Add a small 400ms delay to let the ESP32 digest the config settings
      await new Promise((resolve) => setTimeout(resolve, 400));

      // 2. Send ARM command
      console.log('Writing ARM command over BLE');
      await connectedDevice.writeCharacteristicWithResponseForService(
        BLE_SERVICE_UUID,
        BLE_CHARACTERISTIC_UUID,
        Buffer.from('ARM').toString('base64')
      );

      setConnectionStatus('calibrating');
      return true;
    } catch (e) {
      console.error('Failed to write arm commands over BLE:', e);
      return false;
    }
  }, [connectedDevice, isSimulated]);

  // Disarm System: DISARM
  const disarmSystem = useCallback(async (): Promise<boolean> => {
    console.log('Sending DISARM command');

    if (simulationTimeoutRef.current) {
      clearTimeout(simulationTimeoutRef.current);
      simulationTimeoutRef.current = null;
    }

    if (isSimulated) {
      setConnectionStatus('connected');
      setIsAlerting(false);
      setAlertType(null);
      setReedSafe(true);
      setLdrSafe(true);
      setMpuSafe(true);
      console.log('Simulated system disarmed.');
      return true;
    }

    if (!connectedDevice) {
      console.warn('Cannot disarm: No device connected');
      return false;
    }

    try {
      await connectedDevice.writeCharacteristicWithResponseForService(
        BLE_SERVICE_UUID,
        BLE_CHARACTERISTIC_UUID,
        Buffer.from('DISARM').toString('base64')
      );

      setConnectionStatus('connected');
      setIsAlerting(false);
      setAlertType(null);
      setReedSafe(true);
      setLdrSafe(true);
      setMpuSafe(true);
      return true;
    } catch (e) {
      console.error('Failed to write disarm command over BLE:', e);
      return false;
    }
  }, [connectedDevice, isSimulated]);

  // Reset local alarm states
  const dismissAlarm = useCallback(() => {
    setIsAlerting(false);
    setAlertType(null);
    setReedSafe(true);
    setLdrSafe(true);
    setMpuSafe(true);
  }, []);

  // Simulation helpers
  const enableSimulation = useCallback(() => {
    setIsSimulated(true);
    console.log('Mock simulation mode enabled in Anti-Theft BLE Context');
  }, []);

  const triggerSimulatedAlert = useCallback((type: number) => {
    if (!isSimulated && connectionStatus !== 'armed') {
      console.warn('Must be simulating and armed to trigger simulated alerts.');
      return;
    }

    console.log(`[SIMULATION] Triggering alarm type: ${type}`);
    setIsAlerting(true);
    setAlertType(type);
    
    if (type === ALERT_TYPES.BAG_OPEN) {
      setReedSafe(false);
    } else if (type === ALERT_TYPES.LIGHT_INTRUSION) {
      setLdrSafe(false);
    } else if (type === ALERT_TYPES.MOTION_ALERT) {
      setMpuSafe(false);
    }
  }, [isSimulated, connectionStatus]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
      if (simulationTimeoutRef.current) clearTimeout(simulationTimeoutRef.current);
    };
  }, []);

  const value = useMemo(() => ({
    connectedDevice,
    connectionStatus,
    isScanning,
    devices,
    isSimulated,
    reedSafe,
    ldrSafe,
    mpuSafe,
    enableReed,
    enableLdr,
    enableMpu,
    isAlerting,
    alertType,
    startScan,
    stopScan,
    connect,
    disconnect,
    armSystem,
    disarmSystem,
    dismissAlarm,
    setEnableReed,
    setEnableLdr,
    setEnableMpu,
    enableSimulation,
    triggerSimulatedAlert,
  }), [
    connectedDevice,
    connectionStatus,
    isScanning,
    devices,
    isSimulated,
    reedSafe,
    ldrSafe,
    mpuSafe,
    enableReed,
    enableLdr,
    enableMpu,
    isAlerting,
    alertType,
    startScan,
    stopScan,
    connect,
    disconnect,
    armSystem,
    disarmSystem,
    dismissAlarm,
    enableSimulation,
    triggerSimulatedAlert,
  ]);

  return (
    <AntiTheftBleContext.Provider value={value}>
      {children}
    </AntiTheftBleContext.Provider>
  );
};

export const useAntiTheftBle = () => {
  const context = useContext(AntiTheftBleContext);
  if (!context) {
    throw new Error('useAntiTheftBle must be used within AntiTheftBleProvider');
  }
  return context;
};
