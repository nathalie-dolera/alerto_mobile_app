import { GoogleSignin } from '@react-native-google-signin/google-signin';

GoogleSignin.configure({
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  scopes: ['profile', 'email'],
});

export const handleGoogleLogin = async () => {

try {
    await GoogleSignin.hasPlayServices();
    
    const userInfo = await GoogleSignin.signIn();
    
    console.log("Google Login Success", userInfo);

    const userEmail = userInfo.data?.user?.email;
    if (userEmail) {
      alert(`Success! Welcome, ${userEmail}`);
    } else {
      alert("Login successful, but email was not found.");
    }

    return { success: true, data: userInfo };

  } catch (error: any) {
    console.error("Google Login Error:", error);
    alert(`Error: ${error.message}`);
    
    return { success: false, error: error.message };
  }
};