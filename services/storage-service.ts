const CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME || "";
const UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "";

export const StorageService = {
  async uploadRideScreenshot(uri: string, userId: string): Promise<string | null> {
    if (!CLOUD_NAME || !UPLOAD_PRESET) {
      return null;
    }

    try {
      const data = new FormData();
      
      data.append('file', {
        uri,
        type: 'image/jpeg',
        name: `ride_${userId}_${Date.now()}.jpg`,
      } as any);
      
      data.append('upload_preset', UPLOAD_PRESET);
      data.append('cloud_name', CLOUD_NAME);

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
        {
          method: 'POST',
          body: data,
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      const result = await response.json();
      return result.secure_url || null;
    } catch {
      return null;
    }
  }
};
