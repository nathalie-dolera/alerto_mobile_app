import { AuthProvider, useAuth } from '@/context/auth';
import { BleProvider } from '@/context/ble-context';
import { AntiTheftBleProvider } from '@/context/anti-theft-ble-context';
import { HistoryProvider } from '@/context/history-context';
import { MapProvider } from '@/context/map-context';
import { QuickDestinationsProvider } from '@/context/quick-destination';
import { SavedPlacesProvider } from '@/context/saved-places';
import { useColorScheme } from '@/hooks/use-color-scheme';
import MapLibreGL from '@maplibre/maplibre-react-native';
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
    MapLibreGL.Logger.setLogCallback((log) => {
      return (
        log.tag === 'Mbgl-HttpRequest' &&
        log.message.startsWith('Request failed due to a permanent error: Canceled')
      );
    });
  }, []);

  useEffect(() => {
    if (isLoading) return; 

    const inAuthGroup = segments[0] === '(auth)';
    const inPurposeScreen = segments[1] === 'purpose';

    if (!user && !inAuthGroup) {
      router.replace('/login');
    } else if (user) {
      if (!user.purpose) {
        if (!inPurposeScreen) {
          router.replace('/(auth)/purpose');
        }
      } else {
        const isDriver = user.purpose === 'driver';
        
        if (inAuthGroup) {
          if (isDriver) {
            router.replace('/(driver)');
          } else {
            router.replace('/(tabs)');
          }
        } else if (isDriver && segments[0] === '(tabs)') {
          router.replace('/(driver)');
        } else if (!isDriver && segments[0] === '(driver)') {
          router.replace('/(tabs)');
        }
      }
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
        <Stack.Screen name="(driver)" options={{ headerShown: false }} />
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


      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <BleProvider>
      <AntiTheftBleProvider>
        <AuthProvider>
          <SavedPlacesProvider> 
            <QuickDestinationsProvider>
              <HistoryProvider>
                <MapProvider>
                  <InitialLayout />
                </MapProvider>
              </HistoryProvider>
            </QuickDestinationsProvider>
          </SavedPlacesProvider>
        </AuthProvider>
      </AntiTheftBleProvider>
    </BleProvider>
  );
}
