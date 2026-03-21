import { Stack } from 'expo-router';

export default function MainLayout() {
  return (
    <Stack>
      <Stack.Screen name="map-select" options={{ headerShown: false }} />
      <Stack.Screen name="alarm-config" options={{ headerShown: false }} />
      
      
      <Stack.Screen 
        name="save-location" 
        options={{ 
          presentation: 'transparentModal', 
          headerShown: false,
          animation: 'fade' 
        }} 
      />
    </Stack>
  );
}