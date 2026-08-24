import { Colors } from '@/constants/color';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { PrimaryButton } from '@/components/ui/primary-button';
import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, useColorScheme, View } from 'react-native';

interface LocationPermissionModalProps {
    visible: boolean;
    onAllow: () => void;
    onDeny: () => void;
}

export function LocationPermissionModal({ visible, onAllow, onDeny }: LocationPermissionModalProps) {
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme as 'light' | 'dark'];

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            statusBarTranslucent
        >
            <View style={styles.overlay}>
                <View style={[styles.card, { backgroundColor: colors.card }]}>
                    <View style={styles.iconContainer}>
                        <IconSymbol name="location-sharp" size={28} color={colors.primaryIcon} />
                    </View>
                    
                    <Text style={[styles.title, { color: colors.text }]}>
                        Allow ALERTO to access your location?
                    </Text>
                    
                    <Text style={[styles.subtitle, { color: colors.subtitle }]}>
                        This allows the app to calculate distance to your destinations and trigger your Bag alarm.
                    </Text>
                    
                    <PrimaryButton style={styles.allowButton} onPress={onAllow}>
                        Always Allow
                    </PrimaryButton>
                    
                    <TouchableOpacity style={styles.denyButton} onPress={onDeny}>
                        <Text style={[styles.denyText, { color: colors.subtitle }]}>Don&apos;t allow</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    card: {
        backgroundColor: '#ffffff',
        borderRadius: 32,
        padding: 32,
        width: '100%',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 10,
    },
    iconContainer: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: '#e6ebf5',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
        color: '#1e293b',
        textAlign: 'center',
        marginBottom: 12,
    },
    subtitle: {
        fontSize: 14,
        color: '#64748b',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 32,
    },
    allowButton: {
        width: '100%',
        marginBottom: 20,
    },
    denyButton: {
        paddingVertical: 12,
    },
    denyText: {
        fontSize: 16,
        color: '#94a3b8',
        fontWeight: '500',
    }
});
