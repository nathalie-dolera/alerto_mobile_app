import { useAuth } from '@/context/auth';
import { AuthService } from '@/services/login-register';
import { LoginAlertService } from '@/services/login-alert-service';
import { OtpService } from '@/services/otp-service';
import { handleGoogleLogin } from '@/utils/google';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

interface PendingLoginData {
  user: any;
  email: string;
  name: string;
  isNewDevice: boolean;
}

export const useLoginLogic = () => {
  const [emailLoading, setEmailLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [isOtpModalVisible, setIsOtpModalVisible] = useState(false);
  const [pendingLogin, setPendingLogin] = useState<PendingLoginData | null>(null);
  const { login } = useAuth();
  const router = useRouter();

  /**
   * After credentials are validated, check if device is new.
   * If new device → send OTP and block login until verified.
   * If same device → login immediately.
   */
  const processLoginResult = async (userData: any, userEmail: string, userName: string) => {
    const isNewDevice = await LoginAlertService.isNewDevice(userEmail);

    if (isNewDevice) {
      // New device detected — send OTP and block login
      const otpRes = await OtpService.sendRegistrationOtp(userEmail, userName || 'User');

      if (!otpRes.success) {
        Alert.alert(
          "Verification Error",
          otpRes.error || "Unable to send verification email. Please try again."
        );
        return;
      }

      // Save pending login data and show OTP modal
      setPendingLogin({
        user: userData,
        email: userEmail,
        name: userName,
        isNewDevice: true,
      });
      setIsOtpModalVisible(true);
    } else {
      // Same device — login immediately
      await login(userData);
    }
  };

  const handleEmailLogin = async (email: string, password: string) => {
    if (!email || !password) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    setEmailLoading(true);
    try {
      const response = await AuthService.login({ email, password });
      const data = await response.json();

      if (response.ok && data.success) {
        await processLoginResult(
          data.user,
          data.user.email || email,
          data.user.name || ''
        );
      } else {
        Alert.alert("Login Failed", data.error || "Invalid credentials");
      }
    } catch (error) {
      Alert.alert("Connection Error", "Cannot reach the server.");
    } finally {
      setEmailLoading(false);
    }
  };

  const onGooglePress = async () => {
    setGoogleLoading(true);
    try {
      const result = await handleGoogleLogin();
      if (result.success && result.user) {
        const userEmail = result.user.email || '';
        const userName = result.user.name || 'User';

        // Google OAuth provides its own verified email authentication
        await LoginAlertService.markDeviceTrusted(userEmail);
        
        // Dispatch background login alert if first time on device
        LoginAlertService.sendNewDeviceAlert(
          userEmail,
          userName,
          LoginAlertService.getDeviceInfo()
        ).catch(() => {});

        // Direct login
        await login(result.user);
      } else if (result.error !== 'Canceled') {
        Alert.alert("Google Sign-In Failed", result.error || "Could not sign in with Google.");
      }
    } catch (error: any) {
      Alert.alert("Error", error.message || "An unexpected error occurred");
    } finally {
      setGoogleLoading(false);
    }
  };

  /**
   * Called when user enters the 6-digit OTP from the modal.
   * Verifies the code, then completes the login and saves the device as trusted.
   */
  const handleVerifyLoginOtp = async (otp: string) => {
    if (!pendingLogin) return;

    const verifyRes = OtpService.verifyOtp(pendingLogin.email, otp);
    if (!verifyRes.isValid) {
      Alert.alert("Verification Failed", verifyRes.error || "Invalid verification code.");
      return;
    }

    // OTP verified! Complete the login and mark this device as trusted
    setEmailLoading(true);
    try {
      await login(pendingLogin.user);
      await LoginAlertService.markDeviceTrusted(pendingLogin.email);

      // Also send security alert email (informational)
      LoginAlertService.sendNewDeviceAlert(
        pendingLogin.email,
        pendingLogin.name,
        LoginAlertService.getDeviceInfo()
      ).catch(() => {});

      setIsOtpModalVisible(false);
      setPendingLogin(null);
    } catch {
      Alert.alert("Error", "Failed to complete login.");
    } finally {
      setEmailLoading(false);
    }
  };

  const handleResendLoginOtp = async () => {
    if (!pendingLogin) return;
    const otpRes = await OtpService.sendRegistrationOtp(pendingLogin.email, pendingLogin.name || 'User');

    if (otpRes.success) {
      Alert.alert("Code Resent", `A new 6-digit code has been sent to ${pendingLogin.email}.`);
    } else {
      Alert.alert("Resend Failed", otpRes.error || "Could not resend verification code.");
    }
  };

  const handleCloseLoginOtp = () => {
    setIsOtpModalVisible(false);
    setPendingLogin(null);
    OtpService.clearSession();
  };

  return {
    loading: emailLoading,
    emailLoading,
    googleLoading,
    isOtpModalVisible,
    pendingEmail: pendingLogin?.email || '',
    handleEmailLogin,
    handleVerifyLoginOtp,
    handleResendLoginOtp,
    handleCloseLoginOtp,
    onGooglePress,
  };
};