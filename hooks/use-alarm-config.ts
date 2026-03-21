import { useEffect, useState } from "react";

export type IntensityLevel = keyof typeof intensity_set;

export const intensity_set = {
  light: { 
    id: 'light', 
    title: 'Light',
    subtitle: '0.5 - 1.2 m/s²',
    minDuration: 2,
    maxDuration: 5, 
    defaultDuration: 3 
},
  medium: { 
    id: 'medium',
    title: 'Medium',
    subtitle: '1.2 - 2.0 m/s²',
    minDuration: 2,
    maxDuration: 5,
    defaultDuration: 3 
},
  hard: {
    id: 'hard',
    title: 'Hard',
    subtitle: '2.0 - 3.0 m/s²',
    minDuration: 2,
    maxDuration: 3,
    defaultDuration: 2 
},
};

export function useAlarmConfig() {
  const [distance, setDistance] = useState<string>('500m');
  const [intensity, setIntensity] = useState<IntensityLevel>('light');
  const [duration, setDuration] = useState<number>(intensity_set.light.defaultDuration);
  const [saveSettings, setSaveSettings] = useState<boolean>(true);

  useEffect(() => {
    setDuration(intensity_set[intensity].defaultDuration);
  }, [intensity]);

  const handleSave = () => {
  };

  return { 
    distance, setDistance, intensity, setIntensity, duration, setDuration, currentConfig: intensity_set[intensity], saveSettings, setSaveSettings, handleSave
  }
}
