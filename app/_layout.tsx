import { useColorScheme } from '@/hooks/use-color-scheme';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from "expo-router";

export default function RootLayout() {
  const colorScheme = useColorScheme();

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
      </Stack>
    </ThemeProvider>
  );
}