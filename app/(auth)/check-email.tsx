import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ModalContainer } from '@/components/ui/modal-container';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Colors } from '@/constants/color';
import { AuthService } from '@/services/login-register';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, StyleSheet, useColorScheme, View } from 'react-native';

export default function CheckEmail() {
    const router = useRouter();
    const { email } = useLocalSearchParams<{ email?: string }>();
    const [loading, setLoading] = useState(false);
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme as 'light' | 'dark'];

    const normalizedEmail = typeof email === 'string' ? email : '';

    const handleResend = async () => {
        if (!normalizedEmail) {
            Alert.alert('Missing Email', 'Go back and enter your email again.');
            return;
        }

        setLoading(true);

        try {
            const response = await AuthService.forgotPassword({ email: normalizedEmail });
            const data = await response.json();

            if (!response.ok) {
                Alert.alert('Resend Failed', data.error || 'Unable to resend reset link.');
                return;
            }

            Alert.alert('Email Sent', 'A new password reset link has been sent to your email.');
        } catch {
            Alert.alert('Connection Error', 'Cannot reach the server.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <ModalContainer>

        <View style={styles.content}>
            <View 
            style={[styles.iconCircle, { backgroundColor: theme === 'light' ? '#F0F2FF' : '#1A1A1A' }]}>
                <IconSymbol 
                name="attach-email" 
                size={32} 
                color={colors.lockIcon} />
            </View>

            <ThemedText type="title">
                Check Your Email
            </ThemedText>

            <ThemedText
                style={[styles.subtitle, { color: colors.subtitle }]}>
                    We have sent a password recovery link to {normalizedEmail || 'your email address'}. Please check your inbox and follow the instructions. 
            </ThemedText>

            <PrimaryButton 
                style={{ width: '100%', marginTop: 20 }}
                disabled={loading}
                onPress={() => router.push('/login')}>
                   Back to Login
            </PrimaryButton>

            <ThemedText style={styles.resend}>
                Didn&apos;t receive the email?{' '} 
                <ThemedText 
                type="link" 
                onPress={handleResend}>{loading ? 'Sending...' : 'Resend'}
                </ThemedText>
            </ThemedText>

        </View>
        </ModalContainer>
    );
}

const styles= StyleSheet.create ({
    content: {
        alignItems: 'center',
    },
    backButton: { 
        alignSelf: 'flex-start' 
    },
    iconCircle: {
        width: 70, 
        height: 70, 
        borderRadius: 35,
        justifyContent: 'center',
        alignItems: 'center', 
        marginBottom: 20,
    },
    subtitle: { 
        textAlign: 'center', 
        marginTop: 10, 
        marginBottom: 20 
    },
    resend: {
        marginTop: 22,
        alignItems: 'center',
    },
});