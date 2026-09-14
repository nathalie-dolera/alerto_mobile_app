import { Buffer } from 'buffer';
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Alert, PermissionsAndroid, Platform, Vibration } from 'react-native';
import { BleManager, Device } from 'react-native-ble-plx';
import { BagAlarmSettings } from '../utils/alarm-settings';
global.Buffer = global.Buffer || Buffer;

const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const WRITE_CHARACTERISTIC_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";
const NOTIFY_CHARACTERISTIC_UUID = "12345678-4321-4321-4321-123456789abc";

export interface SensorData {
  heartRate: number;
  spo2: number;
  batteryLevel?: number;
  batteryVoltage?: number;
  fallDetected: boolean;
  latitude: number;
  longitude: number;
  destLat: number;
  destLng: number;
  triggerDistanceKm: number;
  distanceToDestinationKm: number;
  wakeShakeSec: number;
  shakeProgressSec: number;
  settingsReceived: boolean;
  destinationAlarmEnabled: boolean;
  destinationAlarmTriggered: boolean;
  destinationAlarmCompleted: boolean;
  stopLatched: boolean;
  alarmActive: boolean;
  antiTheftActive?: boolean;
  antiTheftType?: number;
  atType?: number;
  sats?: number;
  smsSent?: number;
  status: string;
  shking?: number;
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
  sendAntiTheftStopCommand: () => Promise<boolean>;
  sendBuzzerToggle: (enabled: boolean) => Promise<boolean>;
  sendVibrationToggle: (enabled: boolean) => Promise<boolean>;
  sendForceSound: () => Promise<boolean>;
  sendDestinationAlert: (buzzer?: boolean, vibration?: boolean) => Promise<boolean>;
  sendDestinationStop: () => Promise<boolean>;
  sendStopCommand: () => Promise<boolean>;
  sendEmergencyContacts: (ownerNumber: string, allContacts: string[], selectedContacts?: string[]) => Promise<boolean>;
  sendSmsFormat: (format: 'combined' | 'separate' | 'coords_only') => Promise<boolean>;
  resetSensorAlertState: () => void;
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
        console.log("📥 BLE Received Raw JSON:", jsonStr);
        const rawParsed = JSON.parse(jsonStr);
        const parsed: SensorData = {
          alarmActive: rawParsed.alm === 1 || rawParsed.alm === true || rawParsed.alarmActive === true || rawParsed.alarmActive === "true" || rawParsed.alarm === true || rawParsed.alarm === "true" || rawParsed.alarm === 1,
          antiTheftActive: rawParsed.at === 1 || rawParsed.at === true || rawParsed.antiTheftActive === true || rawParsed.antiTheftActive === "true" || rawParsed.atActive === true || rawParsed.atActive === "true" || rawParsed.atActive === 1,
          antiTheftType: typeof rawParsed.att === 'number' ? rawParsed.att : (typeof rawParsed.antiTheftType === 'number' ? rawParsed.antiTheftType : (typeof rawParsed.atType === 'number' ? rawParsed.atType : (parseInt(rawParsed.atType || rawParsed.att, 10) || 0))),
          atType: typeof rawParsed.att === 'number' ? rawParsed.att : (typeof rawParsed.atType === 'number' ? rawParsed.atType : (typeof rawParsed.antiTheftType === 'number' ? rawParsed.antiTheftType : (parseInt(rawParsed.atType || rawParsed.att, 10) || 0))),
          destinationAlarmEnabled: rawParsed.de === 1 || rawParsed.de === true || rawParsed.destinationAlarmEnabled === true || rawParsed.destinationAlarmEnabled === "true" || rawParsed.destEnabled === true || rawParsed.destEnabled === "true" || rawParsed.destEnabled === 1,
          destinationAlarmTriggered: rawParsed.dt === 1 || rawParsed.dt === true || rawParsed.destinationAlarmTriggered === true || rawParsed.destinationAlarmTriggered === "true" || rawParsed.destTriggered === true || rawParsed.destTriggered === "true" || rawParsed.destTriggered === 1,
          destinationAlarmCompleted: rawParsed.dc === 1 || rawParsed.dc === true || rawParsed.destinationAlarmCompleted === true || rawParsed.destinationAlarmCompleted === "true" || rawParsed.destCompleted === true || rawParsed.destCompleted === "true" || rawParsed.destCompleted === 1,
          wakeShakeSec: typeof rawParsed.shk === 'number' ? rawParsed.shk : (typeof rawParsed.wakeShakeSec === 'number' ? rawParsed.wakeShakeSec : (typeof rawParsed.shakeSec === 'number' ? rawParsed.shakeSec : 3)),
          shakeProgressSec: typeof rawParsed.prog === 'number' ? rawParsed.prog : (typeof rawParsed.shakeProgressSec === 'number' ? rawParsed.shakeProgressSec : (typeof rawParsed.shakeProgress === 'number' ? rawParsed.shakeProgress : 0)),
          triggerDistanceKm: typeof rawParsed.trg === 'number' ? rawParsed.trg : (typeof rawParsed.triggerDistanceKm === 'number' ? rawParsed.triggerDistanceKm : (typeof rawParsed.triggerDist === 'number' ? rawParsed.triggerDist : 1.0)),
          status: typeof rawParsed.st === 'string' ? rawParsed.st : (typeof rawParsed.status === 'string' ? rawParsed.status : 'SAFE'),
          heartRate: typeof rawParsed.heartRate === 'number' ? rawParsed.heartRate : 0,
          spo2: typeof rawParsed.spo2 === 'number' ? rawParsed.spo2 : 0,
          batteryLevel: (() => {
            const rawBattery = rawParsed.bat ?? rawParsed.batteryLevel ?? rawParsed.batteryPercent ?? rawParsed.battery ?? rawParsed.batt;
            const parsedBattery = typeof rawBattery === 'number' ? rawBattery : parseFloat(rawBattery);
            if (!Number.isFinite(parsedBattery)) return undefined;
            return Math.max(0, Math.min(100, parsedBattery));
          })(),
          batteryVoltage: (() => {
            const rawVoltage = rawParsed.vb ?? rawParsed.vbat ?? rawParsed.batteryVoltage ?? rawParsed.voltage;
            const parsedVoltage = typeof rawVoltage === 'number' ? rawVoltage : parseFloat(rawVoltage);
            return Number.isFinite(parsedVoltage) ? parsedVoltage : undefined;
          })(),
          fallDetected: rawParsed.fallDetected === true || rawParsed.fallDetected === "true",
          latitude: typeof rawParsed.lat === 'number' ? rawParsed.lat : (typeof rawParsed.latitude === 'number' ? rawParsed.latitude : 0),
          longitude: typeof rawParsed.lng === 'number' ? rawParsed.lng : (typeof rawParsed.longitude === 'number' ? rawParsed.longitude : 0),
          destLat: typeof rawParsed.destLat === 'number' ? rawParsed.destLat : 0,
          destLng: typeof rawParsed.destLng === 'number' ? rawParsed.destLng : 0,
          sats: typeof rawParsed.sat === 'number' ? rawParsed.sat : (typeof rawParsed.sats === 'number' ? rawParsed.sats : (typeof rawParsed.sat === 'string' ? parseInt(rawParsed.sat, 10) : (typeof rawParsed.sats === 'string' ? parseInt(rawParsed.sats, 10) : 0))),
          smsSent: typeof rawParsed.ss === 'number' ? rawParsed.ss : (typeof rawParsed.smsSent === 'number' ? rawParsed.smsSent : (typeof rawParsed.ss === 'string' ? parseInt(rawParsed.ss, 10) : (typeof rawParsed.smsSent === 'string' ? parseInt(rawParsed.smsSent, 10) : 0))),
          distanceToDestinationKm: typeof rawParsed.rem === 'number'
            ? rawParsed.rem
            : (typeof rawParsed.distanceToDestinationKm === 'number'
                ? rawParsed.distanceToDestinationKm
                : (typeof rawParsed.rem === 'string' ? parseFloat(rawParsed.rem) : 9999)),
          settingsReceived: rawParsed.settingsReceived === true || rawParsed.settingsReceived === "true" || true,
          stopLatched: rawParsed.stopLatched === true || rawParsed.stopLatched === "true",
          shking: (rawParsed.shking === 1 || rawParsed.shking === true) ? 1 : 0,
        };
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
  const disconnectSubscriptionRef = useRef<any>(null);

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
        Alert.alert('Scan Error', error.message);
        setIsScanning(false);
        return;
      }

      if (!device) {
        return;
      }

      const discoveredDevice = device;

      const devName = (discoveredDevice.name || discoveredDevice.localName || '').trim();
      const hasAlertoService = discoveredDevice.serviceUUIDs?.some(
        uuid => uuid.toLowerCase() === SERVICE_UUID.toLowerCase()
      );

      const isAlertoMatch = 
        devName.toLowerCase().includes('alerto') ||
        hasAlertoService;

      if (isAlertoMatch) {
        console.log('MATCH! Found Alerto device:', devName || 'Alerto_Hardware (via UUID)');

        setDevices(prevDevices => {
          const exists = prevDevices.some(d => d.id === discoveredDevice.id);
          if (!exists) {
            console.log('Adding device to list. Total:', prevDevices.length + 1);
            
            // Ensure the device display name is set even if name is null due to BLE caching
            if (!discoveredDevice.name) {
              discoveredDevice.name = devName || 'Alerto_Hardware';
            }
            
            return [...prevDevices, discoveredDevice];
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
        try {
          await connected.requestMTU(512);
        } catch (mtuErr) {
          console.warn('requestMTU failed or ignored:', mtuErr);
        }
      }
      
      await connected.discoverAllServicesAndCharacteristics();
      setConnectedDevice(connected);
      console.log('Connected successfully to:', device.name);

      // Clear old subscription if it exists
      if (disconnectSubscriptionRef.current) {
        disconnectSubscriptionRef.current.remove();
      }

      // Listen for disconnection (unclean, battery pull, out of range, etc.)
      disconnectSubscriptionRef.current = bleManager.onDeviceDisconnected(device.id, (error, d) => {
        console.log('Device disconnected unexpectedly:', device.id);
        Vibration.cancel();
        setConnectedDevice(null);
        setSensorData(null);
        if (disconnectSubscriptionRef.current) {
          disconnectSubscriptionRef.current.remove();
          disconnectSubscriptionRef.current = null;
        }
      });

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
    Vibration.cancel();
    if (connectedDevice) {
      try {
        if (disconnectSubscriptionRef.current) {
          disconnectSubscriptionRef.current.remove();
          disconnectSubscriptionRef.current = null;
        }
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

  const sendAntiTheftStopCommand = useCallback((): Promise<boolean> => {
    return writeCommand('AT:STOP');
  }, [writeCommand]);

  const sendBuzzerToggle = useCallback((enabled: boolean): Promise<boolean> => {
    return writeCommand(enabled ? 'BUZZER_ON' : 'BUZZER_OFF');
  }, [writeCommand]);

  const sendVibrationToggle = useCallback((enabled: boolean): Promise<boolean> => {
    return writeCommand(enabled ? 'VIBRATION_ON' : 'VIBRATION_OFF');
  }, [writeCommand]);

  const sendForceSound = useCallback((): Promise<boolean> => {
    return writeCommand('FORCE_SOUND');
  }, [writeCommand]);

  const resetSensorAlertState = useCallback(() => {
    setSensorData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        destinationAlarmTriggered: false,
        destinationAlarmCompleted: false,
        alarmActive: false,
        status: 'SAFE',
        shakeProgressSec: 0,
      };
    });
  }, []);

  const sendDestinationAlert = useCallback((buzzer = true, vibration = true): Promise<boolean> => {
    resetSensorAlertState();
    return writeCommand(`DA:${buzzer ? 1 : 0},${vibration ? 1 : 0}`);
  }, [writeCommand, resetSensorAlertState]);

  const sendDestinationStop = useCallback(async (): Promise<boolean> => {
    resetSensorAlertState();
    return writeCommand('DS');
  }, [writeCommand, resetSensorAlertState]);

  const sendStopCommand = useCallback(async (): Promise<boolean> => {
    resetSensorAlertState();
    return writeCommand('STOP');
  }, [writeCommand, resetSensorAlertState]);

  // Send ALL contacts → CA: command (used by ESP32 for disconnect SMS regardless of toggle)
  // Send SELECTED contacts → CS: command (used for alarm alerts while BLE is connected)
  const sendEmergencyContacts = useCallback(async (
    ownerNumber: string,
    allContacts: string[],
    selectedContacts?: string[]
  ): Promise<boolean> => {
    const caPayload = `CA:${ownerNumber || ''};${allContacts.join(';')}`;
    const caResult = await writeCommand(caPayload);
    // Small gap between two BLE writes
    await new Promise(r => setTimeout(r, 200));
    // selectedContacts defaults to allContacts if not provided
    const sel = selectedContacts ?? allContacts;
    const csPayload = `CS:${ownerNumber || ''};${sel.join(';')}`;
    const csResult = await writeCommand(csPayload);
    return caResult && csResult;
  }, [writeCommand]);

  const sendSmsFormat = useCallback(async (format: 'combined' | 'separate' | 'coords_only'): Promise<boolean> => {
    let cmd = 'SMS:COMBINED';
    if (format === 'separate') cmd = 'SMS:SEPARATE';
    else if (format === 'coords_only') cmd = 'SMS:COORDS_ONLY';
    console.log(`[BLE] Sending SMS format command: ${cmd}`);
    return writeCommand(cmd);
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
      sendAntiTheftStopCommand,
      sendBuzzerToggle,
      sendVibrationToggle,
      sendForceSound,
      sendDestinationAlert,
      sendDestinationStop,
      sendStopCommand,
      sendEmergencyContacts,
      sendSmsFormat,
      resetSensorAlertState,
      sensorData,
    };
  }, [connectedDevice, isScanning, devices, startScan, stopScan, connect, disconnect, sendSettings, sendAntiTheftConfig, sendAntiTheftArmCommand, sendAntiTheftDisarmCommand, sendAntiTheftStopCommand, sendBuzzerToggle, sendVibrationToggle, sendForceSound, sendDestinationAlert, sendDestinationStop, sendStopCommand, sendEmergencyContacts, sendSmsFormat, resetSensorAlertState, sensorData]);

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
