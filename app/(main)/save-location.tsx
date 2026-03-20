import { IconSymbol } from '@/components/ui/icon-symbol';
import { ModalContainer } from '@/components/ui/modal-container';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Colors } from '@/constants/color';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useColorScheme } from 'react-native';

export default function SaveLocationScreen() {
    const router = useRouter();
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme as 'light' | 'dark'];
    const params = useLocalSearchParams();
    const placeName = params.placeName as string;

    const handleSave = () => {
        router.push('/'); 
    };

    const handleNoThanks = () => {
        router.push('/'); 
    };

    return (
        <ModalContainer>
            <View style={styles.contentContainer}>
                
                <View style={[styles.iconCircle, { backgroundColor: colors.modalIcon }]}>
                    <IconSymbol name="bookmark" size={24} color="#ffffff" />
                </View>

                <Text style={[styles.title, { color: colors.mainText }]}>Save Location?</Text>
                <Text style={[styles.subtitle, { color: colors.mainText }]}>
                    Do you want to save &apos;{placeName || "this location"}&apos; for next time?
                </Text>

                <View style={styles.buttonContainer}>
                    <PrimaryButton style={{ backgroundColor: colors.modalSave }} onPress={handleSave}>
                        Yes, Save it
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