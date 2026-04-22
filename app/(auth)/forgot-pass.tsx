import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ModalContainer } from '@/components/ui/modal-container';
import { PrimaryButton } from '@/components/ui/primary-button';
import { RoundedInput } from '@/components/ui/rounded-input';
import { Colors } from '@/constants/color';
import { AuthService } from '@/services/login-register';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, StyleSheet, TouchableOpacity, useColorScheme, View } from 'react-native';

export default function ForgotPassScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const theme = useColorScheme() ?? 'light';
  const colors = Colors[theme as 'light' | 'dark'];

  const handleForgotPassword = async () => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      Alert.alert('Missing Email', 'Please enter your email address.');
      return;
    }

    setLoading(true);

    try {
      const response = await AuthService.forgotPassword({ email: normalizedEmail });
      const data = await response.json();

      if (!response.ok) {
        Alert.alert('Request Failed', data.error || 'Unable to send reset link.');
        return;
      }
      router.replace({
        pathname: '/check-email',
        params: { email: normalizedEmail },
      });
    } catch {
      Alert.alert('Connection Error', 'Cannot reach the server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalContainer>
      <TouchableOpacity
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
            name="entypo.fill"
            size={32}
            color={colors.lockIcon} />
        </View>

        <ThemedText type="title">
          Forgot Password?
        </ThemedText>

        <ThemedText
          style={[styles.subtitle, { color: colors.subtitle }]}>
          Enter your email to receive a reset link. We&apos;ll help you get back into your account.
        </ThemedText>

        <View style={styles.inputWrap}>
          <ThemedText
            style={styles.label}>Email Address</ThemedText>
          <RoundedInput
            placeholder="name@example.com"
            value={email}
            onChangeText={setEmail}
            leftIcon={{ name: 'feather.fill' }}
          />
        </View>

        <PrimaryButton
          style={{ width: '100%', marginTop: 20 }}
          disabled={loading}
          onPress={handleForgotPassword}>
          {loading ? 'Sending...' : 'Reset Password'}
        </PrimaryButton>

        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.cancelBtn}>
          <ThemedText
            style={{ color: colors.subtitle, fontWeight: '600' }}>Cancel</ThemedText>
        </TouchableOpacity>
      </View>
    </ModalContainer>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignSelf: 'flex-start'
  },
  content: {
    alignItems: 'center'
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
  inputWrap: {
    width: '100%'
  },
  label: {
    alignSelf: 'flex-start',
    marginBottom: 8,
    marginTop: 12,
    fontWeight: '500',
  },
  cancelBtn: {
    marginTop: 20
  },
});
