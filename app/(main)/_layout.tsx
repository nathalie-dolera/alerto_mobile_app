import { Stack } from 'expo-router';
import { MapProvider } from '../../context/map-context';

export default function MainLayout() {
  return (
    <MapProvider>
        <Stack>
          <Stack.Screen name="map-select" options={{ headerShown: false }} />
          <Stack.Screen name="alarm-config" options={{ headerShown: false }} />
          <Stack.Screen name="recent-searches" options={{ headerShown: false }} />
          <Stack.Screen name="save-place" options={{ headerShown: false }} />
          
          <Stack.Screen 
            name="set-alarm" 
            options={{ 
              presentation: 'transparentModal', 
              animation: 'fade', 
              headerShown: false,
              contentStyle: { backgroundColor: 'transparent' } 
            }} 
          />

          <Stack.Screen 
            name="save-location" 
            options={{ 
              presentation: 'transparentModal', 
              headerShown: false,
              contentStyle: { backgroundColor: 'transparent' }
            }} 
          />
        </Stack>
    </MapProvider>
  );
}