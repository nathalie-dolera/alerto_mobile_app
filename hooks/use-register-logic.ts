import { useAuth } from '@/context/auth';
import { AuthService } from '@/services/login-register';
import { handleGoogleLogin } from '@/utils/google';
import { validateRegistration } from '@/utils/password';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

export const useRegisterLogic = () => {
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleRegistration = async (email: string, password: string, confirmPassword: string) => {
    const validation = validateRegistration(password, confirmPassword);
    if (!validation.isValid) {
      Alert.alert("Validation Error", validation.message);
      return;
    }

    setLoading(true);
    try {
      const response = await AuthService.register({
        email,
        password,
        name: email.split('@')[0], 
      });

      const data = await response.json();

      if (response.ok && data.success) {
        Alert.alert("Registration Successful", "You can now log in with your new account.");
        router.replace('/login');
      } else {
        Alert.alert("Registration Failed", data.error || "Something went wrong");
      }
    } catch (error) {
      Alert.alert("Network Error", "Please check your internet connection.");
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
    handleRegistration,
    onGooglePress,
  };
};