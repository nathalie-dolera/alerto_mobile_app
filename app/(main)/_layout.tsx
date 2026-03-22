import { Stack } from 'expo-router';
import { MapProvider } from '../../context/map-context';

export default function MainLayout() {
  return (
    <MapProvider>
      <Stack>
        <Stack.Screen name="map-select" options={{ headerShown: false }} />
        <Stack.Screen name="alarm-config" options={{ headerShown: false }} />
        <Stack.Screen name="recent-searches" options={{ headerShown: false }} />
        <Stack.Screen 
          name="save-location" 
          options={{ 
            presentation: 'transparentModal', 
            headerShown: false 
          }} 
        />
      </Stack>
    </MapProvider>
  );
}