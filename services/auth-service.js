import { API_ENDPOINTS } from '../config/api';

export const authenticateUserWithGoogle = async (googleData) => {
  try {

    const response = await fetch(API_ENDPOINTS.googleAuth, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: googleData.email,
        name: googleData.name,
        googleId: googleData.id,
        image: googleData.photo,
      }),
    });
    
    const rawText = await response.text();
    
    if (rawText.startsWith('<!DOCTYPE html>') || rawText.startsWith('<html')) {
        console.error("HTML Error detected:", rawText);
        throw new Error("Server returned HTML. Check your API route path.");
    }

    const result = JSON.parse(rawText);
    return result;
  } catch (error) {
    console.error("Auth Service Error:", error);
    throw error; 
  }
};