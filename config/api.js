export const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://alerto-web-system.vercel.app/api/mobile';

export const API_ENDPOINTS = {
  googleAuth: `${BASE_URL}/auth/google`,
  login: `${BASE_URL}/auth/login`,
  register: `${BASE_URL}/auth/register`,
  forgotPassword: `${BASE_URL}/auth/forgot-password`,
  resetPassword: `${BASE_URL}/auth/reset-password`,
};
