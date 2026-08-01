import { IconSymbol } from '@/components/ui/icon-symbol';
import { LocationPermissionModal } from '@/components/ui/location-permission-modal';
import { useLocationPrompt } from '@/hooks/use-location-prompt';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
import { useAuth } from '@/context/auth';

export default function TabsLayout() {
    const { isLocationModalVisible, handleAllowLocation, handleDenyLocation } = useLocationPrompt();
    const insets = useSafeAreaInsets();
    const { user } = useAuth();
    return (
        <>
        <Tabs
        screenOptions={{
            headerShown: false,
            tabBarStyle: [styles.tabBar, { height: 65 + insets.bottom, paddingBottom: 10 + insets.bottom }],
            tabBarActiveTintColor: '#ffffff',
            tabBarInactiveTintColor: '#64748b',           
        }}>
            <Tabs.Screen
            name="index"
            options={{
                title: 'Home',
                tabBarIcon: ({ color }) => <IconSymbol name="house.fill" size={28} color={color} />,

            }}
            />

            <Tabs.Screen
            name="alerts"
            options={{
                title: 'Alerts',
                tabBarIcon: ({ color }) => <IconSymbol name="clock.fill" size={28} color={color} />,
            }}
            />

            <Tabs.Screen
            name="settings"
            options={{
                title: 'Settings',
                tabBarIcon: ({ color }) => <IconSymbol name="gearshaper.fill" size={28} color={color} />
            }}
            />

            <Tabs.Screen
            name="history"
            options={{
                title: 'Analytics',
                tabBarIcon: ({ color }) => <IconSymbol name="chart-bar" size={28} color={color} />,
            }}
            />


        </Tabs>
        <LocationPermissionModal 
            visible={isLocationModalVisible}
            onAllow={handleAllowLocation}
            onDeny={handleDenyLocation}
        />
        </>
    );
}

const styles= StyleSheet.create({
    tabBar: {
        backgroundColor: '#12214aff', 
        borderTopWidth: 0,
        height: 65,
        paddingBottom: 10,
    }
})
