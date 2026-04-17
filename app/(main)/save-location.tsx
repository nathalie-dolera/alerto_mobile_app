import { IconSymbol } from '@/components/ui/icon-symbol';
import { ModalContainer } from '@/components/ui/modal-container';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Colors } from '@/constants/color';
import { useAuth } from '@/context/auth';
import { useMapContext } from '@/context/map-context';
import { useSavedPlacesContext } from '@/context/saved-places';
import { SavedPlacesService } from '@/services/saved-places';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View, useColorScheme } from 'react-native';

export default function SaveLocationScreen() {
    const router = useRouter();
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme as 'light' | 'dark'];
    const { region, startAlarm, locationName } = useMapContext(); 
    const { user } = useAuth();  
    const { loadSavedPlaces } = useSavedPlacesContext();
    const params = useLocalSearchParams();
    const placeId = params.placeId as string;
    const placeName = params.placeName as string;
    const distance = params.distance as string;
    const intensity = params.intensity as string;
    const duration = Number(params.duration);
    const redirectToSaved = params.redirectToSaved === 'true';
    const [isSaving, setIsSaving] = useState(false);
    
    const handleSave = async () => {
        if (!user || !user.id) {
            Alert.alert("You must be logged in to save a location.");
            return;
        }

        setIsSaving(true);
        try {
            const locationData = {
                name: placeName || "Unknown Location",
                lat: region[1], 
                lng: region[0], 
                distance,
                intensity,
                duration,
                userId: user.id 
            };

            if (placeId) {
                await SavedPlacesService.update(placeId, locationData);
            } else {
                await SavedPlacesService.create(locationData);
            }            
            await loadSavedPlaces(); 

            if (redirectToSaved) {
                router.push('/(main)/save-place'); 
            } else {
                const thresholdMeters = distance.includes('km') 
                    ? parseFloat(distance) * 1000 
                    : parseFloat(distance);
                startAlarm(placeName || locationName || 'Unknown', region[1], region[0], thresholdMeters);
                router.push({
                   pathname: '/(tabs)/alerts'
                }); 
            }
        } catch (error) {
            Alert.alert("Failed to save location to database.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleNoThanks = async () => {
        if (redirectToSaved) {
            router.push('/(main)/save-place');
        } else {
            const thresholdMeters = distance.includes('km') 
                ? parseFloat(distance) * 1000 
                : parseFloat(distance);
            startAlarm(placeName || locationName || 'Unknown', region[1], region[0], thresholdMeters);
            router.push({
               pathname: '/(tabs)/alerts'
            }); 
        }
    };

    return (
        <ModalContainer>
            <View style={styles.contentContainer}>
                <View style={[styles.iconCircle, { backgroundColor: colors.modalIcon }]}>
                    <IconSymbol name="bookmark" size={24} color="#ffffff" />
                </View>

                <Text style={[styles.title, { color: colors.mainText }]}>Save Location?</Text>
                <Text style={[styles.subtitle, { color: colors.mainText }]}>
                    Do you want to save &apos;{placeName || "this location"}&apos; with its alarm configuration for next time?
                </Text>

                <View style={styles.buttonContainer}>
                    <PrimaryButton style={{ backgroundColor: colors.modalSave }} onPress={handleSave}>
                        {isSaving ? "Saving.." : "Save it"}
                    </PrimaryButton>

                    <PrimaryButton style={{ backgroundColor: colors.modalThanks, marginTop: 12 }} onPress={handleNoThanks}>
                        No, Thanks
                    </PrimaryButton>
                    
                    <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()}>
                        <Text style={[styles.cancelText, { color: colors.subtitle }]}>
                            Cancel
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        </ModalContainer>
    );
}

const styles = StyleSheet.create({
    contentContainer: { 
        alignItems: 'center', 
        paddingVertical: 10 
    },
    iconCircle: { 
        width: 60, 
        height: 60, 
        borderRadius: 30, 
        justifyContent: 'center', 
        alignItems: 'center', 
        marginBottom: 20 
    },
    title: { 
        fontSize: 20, 
        fontWeight: 'bold', 
        marginBottom: 8 
    },
    subtitle: { 
        fontSize: 15, 
        textAlign: 'center', 
        marginBottom: 25, 
        paddingHorizontal: 10, 
        lineHeight: 22 
    },
    buttonContainer: {
        width: '100%' 
    },
    cancelButton: { 
        marginTop: 16, 
        alignItems: 'center', 
        paddingVertical: 8 
    },
    cancelText: { 
        fontSize: 16, 
        fontWeight: '500' 
    }
});