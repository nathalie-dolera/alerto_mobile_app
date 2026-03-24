import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Alert, Linking } from 'react-native';

export function useLocationPrompt() {
    const [isLocationModalVisible, setIsLocationModalVisible] = useState(false);

    useEffect(() => {
        const checkLocationPrompt = async () => {
            const hasPrompted = await AsyncStorage.getItem('alerto_location_prompted');
            if (!hasPrompted) {
                setTimeout(() => {
                    setIsLocationModalVisible(true);
                }, 800); 
            }
        };
        checkLocationPrompt();
    }, []);

    const handleAllowLocation = async () => {
        setIsLocationModalVisible(false);
        await AsyncStorage.setItem('alerto_location_prompted', 'true');
        const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
        if (fgStatus === 'granted') {
            await Location.requestBackgroundPermissionsAsync();
            await AsyncStorage.setItem('alerto_allow_location', 'true');
        } else {
            await AsyncStorage.setItem('alerto_allow_location', 'false');
            Alert.alert(
                "Permission Denied",
                "Location permission is disabled in your device settings. Would you like to open Settings?",
                [
                    { text: "Not Now", style: "cancel" },
                    { text: "Open Settings", onPress: () => Linking.openSettings() }
                ]
            );
        }
    };

    const handleDenyLocation = async () => {
        setIsLocationModalVisible(false);
        await AsyncStorage.setItem('alerto_location_prompted', 'true');
        await AsyncStorage.setItem('alerto_allow_location', 'false');
    };

    return {
        isLocationModalVisible,
        handleAllowLocation,
        handleDenyLocation
    };
}
