import { router } from "expo-router";
import { useState } from "react";

export const duration_config = {
  minDuration: 2,
  maxDuration: 5,
  defaultDuration: 3
};

export function useAlarmConfig() {
  const [distance, setDistance] = useState<string>('500m');
  const [duration, setDuration] = useState<number>(duration_config.defaultDuration);
  const [saveSettings, setSaveSettings] = useState<boolean>(true);

  const handleSave = () => {
    router.push('/(main)/save-location');
  };

  return {
    distance, setDistance, duration, setDuration, currentConfig: duration_config, saveSettings, setSaveSettings, handleSave
  }
}
