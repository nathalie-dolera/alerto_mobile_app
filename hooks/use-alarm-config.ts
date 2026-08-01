import { router } from "expo-router";
import { useState } from "react";

export type IntensityLevel = keyof typeof intensity_set;

export const intensity_set = {
  light: {
    id: 'light',
    title: 'Light',
    subtitle: 'Subtle tingling vibration',
    minDuration: 2,
    maxDuration: 5,
    defaultDuration: 3
  },
  medium: {
    id: 'medium',
    title: 'Medium',
    subtitle: 'Moderate, steady wrist vibration for average sensitivity.',
    minDuration: 2,
    maxDuration: 5,
    defaultDuration: 3
  },
  hard: {
    id: 'hard',
    title: 'Heavy',
    subtitle: 'Strong pulses for deep sleepers who need a firmer alert.',
    minDuration: 2,
    maxDuration: 3,
    defaultDuration: 2
  },
};

export function useAlarmConfig() {
  const [distance, setDistance] = useState<string>('500m');
  const [intensity, setIntensity] = useState<IntensityLevel>('medium');
  const [duration, setDuration] = useState<number>(intensity_set.medium.defaultDuration);
  const [saveSettings, setSaveSettings] = useState<boolean>(true);

  const handleSetIntensity = (newIntensity: IntensityLevel) => {
    setIntensity(newIntensity);
    setDuration(intensity_set[newIntensity].defaultDuration);
  };

  const handleSave = () => {
    router.push('/(main)/save-location');
  };

  return {
    distance, setDistance, intensity, setIntensity: handleSetIntensity, setIntensityRaw: setIntensity, duration, setDuration, currentConfig: intensity_set[intensity], saveSettings, setSaveSettings, handleSave
  }
}
