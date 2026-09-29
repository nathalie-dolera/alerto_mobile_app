import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { ModalContainer } from './modal-container';
import { IconSymbol } from './icon-symbol';
import { ThemedText } from '../themed-text';
import { PrimaryButton } from './primary-button';
import { Colors } from '@/constants/color';

interface VerifyEmailModalProps {
  visible: boolean;
  email: string;
  onVerify: (otp: string) => Promise<void>;
  onResend: () => Promise<void>;
  onClose: () => void;
  loading: boolean;
}

export function VerifyEmailModal({
  visible,
  email,
  onVerify,
  onResend,
  onClose,
  loading,
}: VerifyEmailModalProps) {
  const [otp, setOtp] = useState('');
  const [countdown, setCountdown] = useState(30);
  const [isResending, setIsResending] = useState(false);
  const theme = (useColorScheme() ?? 'light') as 'light' | 'dark';
  const colors = Colors[theme];

  // 30-second countdown for resending
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (visible && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [visible, countdown]);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setOtp('');
      setCountdown(30);
    }
  }, [visible]);

  const handleResendPress = async () => {
    if (countdown > 0 || isResending) return;
    setIsResending(true);
    try {
      await onResend();
      setCountdown(30);
    } finally {
      setIsResending(false);
    }
  };

  const handleVerifyPress = async () => {
    if (otp.trim().length === 0 || loading) return;
    await onVerify(otp.trim());
  };

  return (
    <Modal
      transparent={true}
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <ModalContainer onClose={onClose}>
        <View style={styles.container}>
          {/* Header Icon */}
          <View style={[styles.iconCircle, { backgroundColor: theme === 'light' ? '#EBF3FF' : '#1e293b' }]}>
            <IconSymbol name="attach-email" size={36} color={colors.containerText} />
          </View>

          {/* Title & Description */}
          <ThemedText type="title" style={[styles.title, { color: colors.mainText }]}>
            Verify Your Email
          </ThemedText>

          <ThemedText style={[styles.subtitle, { color: colors.subtitle }]}>
            We sent a 6-digit code to{'\n'}
            <Text style={{ fontWeight: '700', color: colors.mainText }}>{email}</Text>
          </ThemedText>

          {/* 6-Digit OTP Code Input */}
          <View style={[styles.inputWrapper, { borderColor: colors.hr, backgroundColor: theme === 'light' ? '#f8fafd' : '#141c30' }]}>
            <TextInput
              style={[
                styles.otpInput,
                { color: colors.mainText },
              ]}
              placeholder="000000"
              placeholderTextColor={colors.subtitle}
              value={otp}
              onChangeText={(val) => setOtp(val.replace(/[^0-9]/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus={true}
              textAlign="center"
            />
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonWrapper}>
            <PrimaryButton
              onPress={handleVerifyPress}
              disabled={otp.length !== 6 || loading}
              style={{ width: '100%' }}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                'Verify & Create Account'
              )}
            </PrimaryButton>
          </View>

          {/* Resend Code */}
          <View style={styles.resendRow}>
            <ThemedText style={{ color: colors.subtitle, fontSize: 13 }}>
              Didn't receive the code?{' '}
            </ThemedText>
            {countdown > 0 ? (
              <ThemedText style={{ color: colors.containerText, fontWeight: '600', fontSize: 13 }}>
                Resend in {countdown}s
              </ThemedText>
            ) : (
              <TouchableOpacity onPress={handleResendPress} disabled={isResending}>
                <ThemedText type="link" style={{ fontSize: 13, fontWeight: 'bold' }}>
                  {isResending ? 'Sending...' : 'Resend Code'}
                </ThemedText>
              </TouchableOpacity>
            )}
          </View>

          {/* Cancel / Edit Details */}
          <TouchableOpacity onPress={onClose} style={styles.cancelButton}>
            <ThemedText style={{ color: colors.subtitle, fontSize: 13, textDecorationLine: 'underline' }}>
              Cancel & Edit Details
            </ThemedText>
          </TouchableOpacity>
        </View>
      </ModalContainer>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  inputWrapper: {
    width: '100%',
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  otpInput: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 10,
    height: 48,
  },
  buttonWrapper: {
    width: '100%',
    marginBottom: 16,
  },
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  cancelButton: {
    paddingVertical: 6,
  },
});
