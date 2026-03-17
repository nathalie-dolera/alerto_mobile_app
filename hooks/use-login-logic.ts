import { useAuth } from '@/context/auth';
import { AuthService } from '@/services/login-register';
import { handleGoogleLogin } from '@/utils/google';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

export const useLoginLogic = () => {
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleEmailLogin = async (email: string, password: string) => {
    if (!email || !password) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    setLoading(true);
    try {
      const response = await AuthService.login({ email, password });
      const data = await response.json();

      if (response.ok && data.success) {
        await login(data.user);
        router.replace('/(tabs)');
      } else {
        Alert.alert("Login Failed", data.error || "Invalid credentials");
      }
    } catch (error) {
      Alert.alert("Connection Error", "Cannot reach the server.");
    } finally {
      setLoading(false);
    }
  };

  const onGooglePress = async () => {
    setLoading(true);
    try {
      const result = await handleGoogleLogin();
      if (result.success) {
        await login(result.user);
        router.replace('/(tabs)');
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
    handleEmailLogin,
    onGooglePress,
  };
};