import { IconSymbol } from '@/components/ui/icon-symbol';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
export default function DriverLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#12214aff',
          borderTopWidth: 0,
          height: 65 + insets.bottom,
          paddingBottom: 10 + insets.bottom,
        },
        tabBarActiveTintColor: '#ffffff',
        tabBarInactiveTintColor: '#64748b',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol name="house.fill" size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <IconSymbol name="gearshaper.fill" size={28} color={color} />,
        }}
      />
    </Tabs>
  );
}
