import { API_ENDPOINTS } from '../config/api';

export const authenticateUserWithGoogle = async (googleData) => {
  try {

    const response = await fetch(API_ENDPOINTS.googleAuth, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: googleData.email,
        name: googleData.name,
        googleId: googleData.id,
        image: googleData.photo,
      }),
    });

    const result = await response.json();
    return result;
  } catch (error) {
    console.error("Auth Service Error:", error);
    throw error; 
  }
};