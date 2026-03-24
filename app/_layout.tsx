import { AuthProvider, useAuth } from '@/context/auth';
import { QuickDestinationsProvider } from '@/context/quick-destination';
import { SavedPlacesProvider } from '@/context/saved-places';
import { MapProvider } from '@/context/map-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';


function InitialLayout() {
  const colorScheme = useColorScheme();
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return; 

    const inAuthGroup = segments[0] === '(auth)';

    if (!user && !inAuthGroup) {
      router.replace('/login');
    } else if (user && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [user, isLoading, segments, router]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen 
          name="(auth)/forgot-pass" 
          options={{ 
            presentation: 'transparentModal', 
            animation: 'fade',  
            headerTransparent: true,
            contentStyle: { 
              backgroundColor: 'transparent' 
            }
          }} 
        />
        <Stack.Screen 
          name="(auth)/check-email" 
          options={{ 
            presentation: 'transparentModal', 
            animation: 'fade',  
            headerTransparent: true,
            contentStyle: { 
              backgroundColor: 'transparent' 
            }
          }} 
        />
        <Stack.Screen 
          name="set-alarm" 
          options={{ 
            presentation: 'transparentModal', 
            animation: 'fade',  
            headerTransparent: true,
            contentStyle: { backgroundColor: 'transparent' }
          }} 
        />

      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <SavedPlacesProvider> 
        <QuickDestinationsProvider>
          <MapProvider>
            <InitialLayout />
          </MapProvider>
        </QuickDestinationsProvider>
      </SavedPlacesProvider>
    </AuthProvider>
  );
}