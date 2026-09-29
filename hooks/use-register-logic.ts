import { useAuth } from '@/context/auth';
import { AuthService } from '@/services/login-register';
import { OtpService } from '@/services/otp-service';
import { handleGoogleLogin } from '@/utils/google';
import { validateRegistration } from '@/utils/password';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

export const useRegisterLogic = () => {
  const [loading, setLoading] = useState(false);
  const [isOtpModalVisible, setIsOtpModalVisible] = useState(false);
  const [pendingRegistrationData, setPendingRegistrationData] = useState<{
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    confirmPassword: string;
  } | null>(null);

  const { login } = useAuth();
  const router = useRouter();

  const handleRegistration = async (
    firstName: string,
    lastName: string,
    email: string,
    password: string,
    confirmPassword: string
  ) => {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      Alert.alert("Validation Error", "Please fill in all fields.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      Alert.alert("Invalid Email", "Please enter a valid email address.");
      return;
    }

    const validation = validateRegistration(password, confirmPassword);
    if (!validation.isValid) {
      Alert.alert("Validation Error", validation.message);
      return;
    }

    setLoading(true);
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`;
      
      // Send 6-digit OTP code to the user's Gmail
      const otpRes = await OtpService.sendRegistrationOtp(email.trim(), fullName);

      if (!otpRes.success) {
        Alert.alert("Email Delivery Failed", otpRes.error || "Unable to send verification email. Please check your email.");
        return;
      }

      // Save pending registration data and open the OTP verification modal
      setPendingRegistrationData({
        firstName,
        lastName,
        email: email.trim(),
        password,
        confirmPassword,
      });
      setIsOtpModalVisible(true);
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to initiate registration.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (otp: string) => {
    if (!pendingRegistrationData) return;

    // Validate the 6-digit OTP
    const verifyRes = OtpService.verifyOtp(pendingRegistrationData.email, otp);
    if (!verifyRes.isValid) {
      Alert.alert("Verification Failed", verifyRes.error || "Invalid verification code.");
      return;
    }

    // OTP verified! Submit account creation to database
    setLoading(true);
    try {
      const fullName = `${pendingRegistrationData.firstName.trim()} ${pendingRegistrationData.lastName.trim()}`;
      const response = await AuthService.register({
        email: pendingRegistrationData.email,
        password: pendingRegistrationData.password,
        confirmPassword: pendingRegistrationData.confirmPassword,
        name: fullName,
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setIsOtpModalVisible(false);
        setPendingRegistrationData(null);
        Alert.alert(
          "🎉 Email Verified!",
          "Your Alerto account has been successfully created and verified. You can now log in."
        );
        router.replace('/login');
      } else {
        Alert.alert("Registration Failed", data.error || "Something went wrong while saving your account.");
      }
    } catch {
      Alert.alert("Network Error", "Cannot reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!pendingRegistrationData) return;
    const fullName = `${pendingRegistrationData.firstName.trim()} ${pendingRegistrationData.lastName.trim()}`;
    const otpRes = await OtpService.sendRegistrationOtp(pendingRegistrationData.email, fullName);

    if (otpRes.success) {
      Alert.alert("Code Resent", `A new 6-digit code has been sent to ${pendingRegistrationData.email}.`);
    } else {
      Alert.alert("Resend Failed", otpRes.error || "Could not resend verification code.");
    }
  };

  const handleCloseOtpModal = () => {
    setIsOtpModalVisible(false);
    OtpService.clearSession();
  };

  const onGooglePress = async () => {
    setLoading(true);
    try {
      const result = await handleGoogleLogin();

      if (result.success) {
        await login(result.user);
      } else if (result.error !== 'Canceled') {
        Alert.alert("Login Failed", result.error);
      }
    } catch (error: any) {
      Alert.alert("Error", error.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    isOtpModalVisible,
    pendingEmail: pendingRegistrationData?.email || '',
    handleRegistration,
    handleVerifyOtp,
    handleResendOtp,
    handleCloseOtpModal,
    onGooglePress,
  };
};