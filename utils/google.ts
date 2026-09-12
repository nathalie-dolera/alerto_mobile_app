import { authenticateUserWithGoogle } from '@/services/auth-service';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';

const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const googleClientIdPattern = /^[\w-]+\.apps\.googleusercontent\.com$/;
const googleConfigError =
  'Google login is not configured correctly. Please check the Web OAuth client ID, Android package com.alerto.mobile, and SHA-1 certificate in Google Cloud/Firebase.';

const getGoogleLoginErrorMessage = (error: unknown) => {
  if (typeof error === 'object' && error !== null) {
    const maybeGoogleError = error as { code?: string; message?: string };
    const code = maybeGoogleError.code;
    const message = maybeGoogleError.message ?? '';
    const normalizedMessage = message.toLowerCase();

    if (code === statusCodes.SIGN_IN_CANCELLED || normalizedMessage === 'cancelled') {
      return 'Canceled';
    }

    if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      return 'Google Play Services is not available or needs to be updated.';
    }

    if (
      code === '10' ||
      normalizedMessage.includes('developer_error') ||
      normalizedMessage.includes('developer error') ||
      normalizedMessage.includes('developer console is not set up correctly')
    ) {
      return googleConfigError;
    }

    if (message) {
      return message;
    }
  }

  return 'Google login failed. Please try again.';
};

if (!googleWebClientId || !googleClientIdPattern.test(googleWebClientId)) {
  console.warn('Invalid EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID. Google login will fail until it is set to a Web OAuth client ID.');
}

if (googleIosClientId && !googleClientIdPattern.test(googleIosClientId)) {
  console.warn('Invalid EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID. iOS Google login may fail until it is set to an iOS OAuth client ID.');
}

GoogleSignin.configure({
  webClientId: googleWebClientId,
  iosClientId: googleIosClientId,
  scopes: ['profile', 'email'],
});

export const handleGoogleLogin = async () => {

  try {
    await GoogleSignin.hasPlayServices();

    if (await GoogleSignin.hasPreviousSignIn()) {
      await GoogleSignin.signOut();
    }

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
      image: googleUser.photo ?? '',
    });

    if (backendResponse.success) {
      return { success: true, user: backendResponse.user };
    } else {
      throw new Error(backendResponse.error || "Failed to sync with database");
    }

  } catch (error: any) {
    console.error("Google Login Error:", error);
    return { success: false, error: getGoogleLoginErrorMessage(error) };
  }
};
