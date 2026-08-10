import { ALERT_TYPES } from '@/constants/ble-anti-theft';
import { useBleContext } from '@/context/ble-context';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Vibration } from 'react-native';
import { Device } from 'react-native-ble-plx';
import { sendLocalNotification } from '../utils/notifications';

export type ConnectionStatus = 'disconnected' | 'scanning' | 'connecting' | 'connected' | 'armed' | 'calibrating';

interface AntiTheftBleContextType {
  connectedDevice: Device | null;
  connectionStatus: ConnectionStatus;
  isScanning: boolean;
  devices: Device[];
  isSimulated: boolean;
  reedSafe: boolean;
  ldrSafe: boolean;
  mpuSafe: boolean;
  enableReed: boolean;
  enableLdr: boolean;
  enableMpu: boolean;
  enableBuzzer: boolean;
  isMonitoringEnabled: boolean;
  isAlerting: boolean;
  alertType: number | null;
  startScan: () => Promise<void>;
  stopScan: () => void;
  connect: (device: Device) => Promise<void>;
  disconnect: () => Promise<void>;
  armSystem: (enableReed: boolean, enableLdr: boolean, enableMpu: boolean) => Promise<boolean>;
  disarmSystem: () => Promise<boolean>;
  dismissAlarm: () => void;
  setEnableReed: (val: boolean) => void;
  setEnableLdr: (val: boolean) => void;
  setEnableMpu: (val: boolean) => void;
  setEnableBuzzer: (val: boolean) => void;
  enableSimulation: () => void;
  triggerSimulatedAlert: (type: number) => void;
}

const AntiTheftBleContext = createContext<AntiTheftBleContextType | undefined>(undefined);
const MOCK_DEVICE_ID = 'MOCK-ALERTO-BAGTAG-ID';

const mockDevice = {
  id: MOCK_DEVICE_ID,
  name: 'Alerto Bag Gateway (Simulated)',
  localName: 'Alerto Bag Gateway (Simulated)',
} as unknown as Device;

export const AntiTheftBleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const wearableBle = useBleContext();
  const [isSimulated, setIsSimulated] = useState(false);
  const [localStatus, setLocalStatus] = useState<ConnectionStatus>('disconnected');
  const [reedSafe, setReedSafe] = useState(true);
  const [ldrSafe, setLdrSafe] = useState(true);
  const [mpuSafe, setMpuSafe] = useState(true);
  const [enableReed, setEnableReed] = useState(true);
  const [enableLdr, setEnableLdr] = useState(true);
  const [enableMpu, setEnableMpu] = useState(false);
  const [enableBuzzer, setEnableBuzzerState] = useState(true);
  const [isMonitoringEnabled, setIsMonitoringEnabled] = useState(false);
  const [isAlerting, setIsAlerting] = useState(false);
  const [alertType, setAlertType] = useState<number | null>(null);
  const [mockDevices, setMockDevices] = useState<Device[]>([]);
  const simulationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connectedDevice = isSimulated ? mockDevice : wearableBle.connectedDevice;
  const devices = isSimulated ? mockDevices : wearableBle.devices;
  const isScanning = isSimulated ? localStatus === 'scanning' : wearableBle.isScanning;

  const resetSensorState = useCallback(() => {
    setIsAlerting(false);
    setAlertType(null);
    setReedSafe(true);
    setLdrSafe(true);
    setMpuSafe(true);
    Vibration.cancel();
  }, []);

  useEffect(() => {
    const data = wearableBle.sensorData;
    if (!data) return;

    const theftType = data.antiTheftType ?? 0;
    const status = data.status ?? '';
    const active = data.antiTheftActive === true || status.startsWith('THEFT_') || theftType > 0;

    if (status === 'ANTI_THEFT_ARMED' || status === 'armed') {
      setIsMonitoringEnabled(true);
      setLocalStatus('armed');
    } else if (status === 'calibrating') {
      setLocalStatus('calibrating');
    }

    if (active) {
      setIsMonitoringEnabled(true);
      setLocalStatus('armed');
    }

    if (!active) {
      if (
        status === 'STOPPED_BY_APP' ||
        status === 'SAFE' ||
        status === 'WAKE_SHAKE_DONE' ||
        status === 'ANTI_THEFT_DISARMED'
      ) {
        resetSensorState();
        if (status === 'ANTI_THEFT_DISARMED') {
          setIsMonitoringEnabled(false);
        }
        if (wearableBle.connectedDevice && localStatus !== 'disconnected') {
          setLocalStatus('connected');
        }
      }
      return;
    }

    const isEffectivelyMonitoring = isMonitoringEnabled || active;
    const effectiveStatus = active ? 'armed' : localStatus;

    if (!isEffectivelyMonitoring && effectiveStatus !== 'armed' && effectiveStatus !== 'calibrating') {
      resetSensorState();
      return;
    }

    setIsAlerting(true);

    if (theftType === ALERT_TYPES.BAG_OPEN || status === 'THEFT_BAG_OPEN') {
      if (reedSafe) {
        sendLocalNotification('Alerto Anti-Theft', 'Zipper open detected on your bag module! Please check your bag.');
        Vibration.vibrate([0, 500, 200, 500], true);
      }
      setAlertType(ALERT_TYPES.BAG_OPEN);
      setReedSafe(false);
    } else if (theftType === ALERT_TYPES.LIGHT_INTRUSION || status === 'THEFT_LIGHT_INTRUSION') {
      if (ldrSafe) {
        sendLocalNotification('Alerto Anti-Theft', 'Light spike detected on your bag module! Please check your bag.');
        Vibration.vibrate([0, 500, 200, 500], true);
      }
      setAlertType(ALERT_TYPES.LIGHT_INTRUSION);
      setLdrSafe(false);
    } else if (theftType === ALERT_TYPES.MOTION_ALERT || status === 'THEFT_MOTION_ALERT') {
      if (mpuSafe) {
        sendLocalNotification('Alerto Anti-Theft', 'Movement detected on your bag module! Please check your bag.');
        Vibration.vibrate([0, 500, 200, 500], true);
      }
      setAlertType(ALERT_TYPES.MOTION_ALERT);
      setMpuSafe(false);
    }
  }, [
    enableLdr,
    enableMpu,
    enableReed,
    isMonitoringEnabled,
    localStatus,
    resetSensorState,
    wearableBle.connectedDevice,
    wearableBle.sensorData,
  ]);

  const connectionStatus = useMemo<ConnectionStatus>(() => {
    if (isSimulated) return localStatus;
    if (wearableBle.isScanning) return 'scanning';
    if (!wearableBle.connectedDevice) return 'disconnected';
    if (localStatus === 'armed' || localStatus === 'calibrating') return localStatus;
    return 'connected';
  }, [isSimulated, localStatus, wearableBle.connectedDevice, wearableBle.isScanning]);

  const startScan = useCallback(async () => {
    if (isSimulated || Platform.OS === 'web') {
      setIsSimulated(true);
      setLocalStatus('scanning');
      setMockDevices([]);
      setTimeout(() => {
        setMockDevices([mockDevice]);
        setLocalStatus('disconnected');
      }, 700);
      return;
    }

    setLocalStatus('scanning');
    await wearableBle.startScan();
  }, [isSimulated, wearableBle]);

  const stopScan = useCallback(() => {
    if (isSimulated) {
      setLocalStatus(connectedDevice ? 'connected' : 'disconnected');
      return;
    }
    wearableBle.stopScan();
    if (!wearableBle.connectedDevice) {
      setLocalStatus('disconnected');
    }
  }, [connectedDevice, isSimulated, wearableBle]);

  const connect = useCallback(async (device: Device): Promise<void> => {
    if (device.id === MOCK_DEVICE_ID || isSimulated) {
      setIsSimulated(true);
      setLocalStatus('connected');
      setIsMonitoringEnabled(false);
      setMockDevices([mockDevice]);
      return;
    }

    setLocalStatus('connecting');
    await wearableBle.connect(device);
    setLocalStatus('connected');
    setIsMonitoringEnabled(false);
  }, [isSimulated, wearableBle]);

  const disconnect = useCallback(async (): Promise<void> => {
    if (simulationTimeoutRef.current) {
      clearTimeout(simulationTimeoutRef.current);
      simulationTimeoutRef.current = null;
    }

    resetSensorState();
    setIsMonitoringEnabled(false);

    if (isSimulated) {
      setIsSimulated(false);
      setMockDevices([]);
      setLocalStatus('disconnected');
      return;
    }

    await wearableBle.disconnect();
    setLocalStatus('disconnected');
  }, [isSimulated, resetSensorState, wearableBle]);

  const armSystem = useCallback(async (reed: boolean, ldr: boolean, mpu: boolean): Promise<boolean> => {
    resetSensorState();
    setIsMonitoringEnabled(false);

    if (isSimulated) {
      setLocalStatus('calibrating');
      if (simulationTimeoutRef.current) clearTimeout(simulationTimeoutRef.current);
      simulationTimeoutRef.current = setTimeout(() => {
        setIsMonitoringEnabled(true);
        setLocalStatus('armed');
      }, 3000);
      return true;
    }

    if (!wearableBle.connectedDevice) {
      return false;
    }

    const configSent = await wearableBle.sendAntiTheftConfig(reed, ldr, mpu, enableBuzzer);
    if (!configSent) return false;

    await new Promise((resolve) => setTimeout(resolve, 400));
    const armSent = await wearableBle.sendAntiTheftArmCommand();
    if (armSent) {
      setIsMonitoringEnabled(true);
      setLocalStatus('calibrating');
      if (simulationTimeoutRef.current) clearTimeout(simulationTimeoutRef.current);
      simulationTimeoutRef.current = setTimeout(() => setLocalStatus('armed'), 3000);
    }
    return armSent;
  }, [isSimulated, resetSensorState, wearableBle, enableBuzzer]);

  const disarmSystem = useCallback(async (): Promise<boolean> => {
    if (simulationTimeoutRef.current) {
      clearTimeout(simulationTimeoutRef.current);
      simulationTimeoutRef.current = null;
    }

    resetSensorState();
    setIsMonitoringEnabled(false);

    if (isSimulated) {
      setLocalStatus('connected');
      return true;
    }

    const sent = await wearableBle.sendAntiTheftDisarmCommand();
    if (sent) {
      await wearableBle.sendAntiTheftConfig(false, false, false, false);
    }
    if (sent) setLocalStatus('connected');
    return sent;
  }, [isSimulated, resetSensorState, wearableBle]);

  const syncConfigToHardware = useCallback(async (reed: boolean, ldr: boolean, mpu: boolean, buzzer: boolean) => {
    if (!isSimulated && wearableBle.connectedDevice) {
      console.log('Syncing config to ESP32:', { reed, ldr, mpu, buzzer });
      await wearableBle.sendAntiTheftConfig(reed, ldr, mpu, buzzer);
    }
  }, [isSimulated, wearableBle]);

  const handleSetEnableReed = useCallback((val: boolean) => {
    setEnableReed(val);
    void syncConfigToHardware(val, enableLdr, enableMpu, enableBuzzer);
  }, [enableLdr, enableMpu, enableBuzzer, syncConfigToHardware]);

  const handleSetEnableLdr = useCallback((val: boolean) => {
    setEnableLdr(val);
    void syncConfigToHardware(enableReed, val, enableMpu, enableBuzzer);
  }, [enableReed, enableMpu, enableBuzzer, syncConfigToHardware]);

  const handleSetEnableMpu = useCallback((val: boolean) => {
    setEnableMpu(val);
    void syncConfigToHardware(enableReed, enableLdr, val, enableBuzzer);
  }, [enableReed, enableLdr, enableBuzzer, syncConfigToHardware]);

  const handleSetEnableBuzzer = useCallback((val: boolean) => {
    setEnableBuzzerState(val);
    void syncConfigToHardware(enableReed, enableLdr, enableMpu, val);
  }, [enableReed, enableLdr, enableMpu, syncConfigToHardware]);

  const dismissAlarm = useCallback(() => {
    resetSensorState();
    void wearableBle.sendAntiTheftStopCommand();
  }, [resetSensorState, wearableBle]);

  const enableSimulation = useCallback(() => {
    setIsSimulated(true);
    setMockDevices([mockDevice]);
  }, []);

  const triggerSimulatedAlert = useCallback((type: number) => {
    if (!isSimulated || connectionStatus !== 'armed' || !isMonitoringEnabled) return;

    if (
      (type === ALERT_TYPES.BAG_OPEN && !enableReed) ||
      (type === ALERT_TYPES.LIGHT_INTRUSION && !enableLdr) ||
      (type === ALERT_TYPES.MOTION_ALERT && !enableMpu)
    ) {
      return;
    }

    setIsAlerting(true);
    setAlertType(type);

    if (type === ALERT_TYPES.BAG_OPEN) {
      if (reedSafe) {
        sendLocalNotification('Alerto Anti-Theft (Simulated)', 'Zipper open detected on your bag module! Please check your bag.');
        Vibration.vibrate([0, 500, 200, 500], true);
      }
      setReedSafe(false);
    }
    else if (type === ALERT_TYPES.LIGHT_INTRUSION) {
      if (ldrSafe) {
        sendLocalNotification('Alerto Anti-Theft (Simulated)', 'Light spike detected on your bag module! Please check your bag.');
        Vibration.vibrate([0, 500, 200, 500], true);
      }
      setLdrSafe(false);
    }
    else if (type === ALERT_TYPES.MOTION_ALERT) {
      if (mpuSafe) {
        sendLocalNotification('Alerto Anti-Theft (Simulated)', 'Movement detected on your bag module! Please check your bag.');
        Vibration.vibrate([0, 500, 200, 500], true);
      }
      setMpuSafe(false);
    }
  }, [
    connectionStatus,
    enableLdr,
    enableMpu,
    enableReed,
    isMonitoringEnabled,
    isSimulated,
    reedSafe,
    ldrSafe,
    mpuSafe,
  ]);

  useEffect(() => {
    return () => {
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
    enableBuzzer,
    isMonitoringEnabled,
    isAlerting,
    alertType,
    startScan,
    stopScan,
    connect,
    disconnect,
    armSystem,
    disarmSystem,
    dismissAlarm,
    setEnableReed: handleSetEnableReed,
    setEnableLdr: handleSetEnableLdr,
    setEnableMpu: handleSetEnableMpu,
    setEnableBuzzer: handleSetEnableBuzzer,
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
    enableBuzzer,
    isMonitoringEnabled,
    isAlerting,
    alertType,
    startScan,
    stopScan,
    connect,
    disconnect,
    armSystem,
    disarmSystem,
    dismissAlarm,
    handleSetEnableReed,
    handleSetEnableLdr,
    handleSetEnableMpu,
    handleSetEnableBuzzer,
    enableSimulation,
    triggerSimulatedAlert,
    wearableBle,
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
