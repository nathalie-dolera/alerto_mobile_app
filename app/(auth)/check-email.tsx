import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ModalContainer } from '@/components/ui/modal-container';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Colors } from '@/constants/color';
import { useRouter } from 'expo-router';
import { StyleSheet, TouchableOpacity, useColorScheme, View } from 'react-native';

export default function ChechEmail() {
    const router = useRouter();
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme as 'light' | 'dark'];

    return (
        <ModalContainer>
        \      <TouchableOpacity 
                    onPress={() => router.back()} 
                    style={styles.backButton}>
                <IconSymbol 
                    name="ionicons.fill" 
                    size={35} 
                    color={colors.eyeIcon} />
              </TouchableOpacity>

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
                    We have sent a password recovery link to your email address. Please your inbox and follow the instructions. 
            </ThemedText>

            <PrimaryButton 
                style={{ width: '100%', marginTop: 20 }}
                onPress={() => router.push('/login')}>
                   Back to Login
            </PrimaryButton>

            <ThemedText style={styles.resend}>
                Didn&apos;t receive the email?{' '} 
                <ThemedText 
                type="link" 
                onPress={() => {}}>Resend
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

