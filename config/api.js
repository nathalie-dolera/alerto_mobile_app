export const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export const API_ENDPOINTS = {
  googleAuth: `${BASE_URL}/auth/google`,
  login: `${BASE_URL}/api/mobile/auth/login`,
  register: `${BASE_URL}/api/mobile/auth/register`,
};