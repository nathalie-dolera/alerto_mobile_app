import { API_ENDPOINTS } from '@/config/api';

export const AuthService = {
  // Manual login request
  async login(credentials: { email: string; password: any }) {
    const response = await fetch(API_ENDPOINTS.login, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    return response;
  },

  // Manual registration request
  async register(userData: { email: string; password: any; name: string }) {
    const response = await fetch(API_ENDPOINTS.register, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });
    return response;
  }
};