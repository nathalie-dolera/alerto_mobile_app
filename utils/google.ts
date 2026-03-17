import { authenticateUserWithGoogle } from '@/services/auth-service';
import { GoogleSignin } from '@react-native-google-signin/google-signin';

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID, 
  scopes: ['profile', 'email'],
});

export const handleGoogleLogin = async () => {

try {
    await GoogleSignin.hasPlayServices();
    
    const userInfo = await GoogleSignin.signIn();

    console.log("Google Login Success", userInfo);

    const googleUser = userInfo.data?.user;

    if (!googleUser) {
      throw new Error("No user data received from Google");
    }

    const backendResponse = await authenticateUserWithGoogle({
      email: googleUser.email,
      name: googleUser.name ?? '',
      id: googleUser.id,
      photo: googleUser.photo ?? ''
    });

    if (backendResponse.success) {
      return { success: true, user: backendResponse.user };
    } else {
      throw new Error(backendResponse.error || "Failed to sync with database");
    }

  } catch (error: any) {
    console.error("Google Login Error:", error);
    return { success: false, error: error.message };
  }
};