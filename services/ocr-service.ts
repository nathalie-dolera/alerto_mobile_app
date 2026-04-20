import { GoogleGenerativeAI } from "@google/generative-ai";

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

export interface RideDetails {
  driverName: string;
  plateNumber: string;
  bookingType: 'Grab' | 'Joyride' | 'Move It' | 'Other';
  rawText?: string;
}

export const OcrService = {
  async parseRideScreenshot(base64Image: string): Promise<RideDetails | null> {
    if (!GEMINI_API_KEY) {
      return null;
    }

    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const prompt = `
        Analyze this screenshot from a transport booking app (like Grab or Joyride).
        Find the following information:
        1. Driver Name (Full Name)
        2. Plate Number (Vehicle Plate)
        3. Booking App (Identify if it is Grab, Joyride, Move It, or another app)

        Return the result strictly as a JSON object with the following fields:
        {
          "driverName": "string",
          "plateNumber": "string",
          "bookingType": "Grab" | "Joyride" | "Move It" | "Other"
        }
        If any field is not found, use an empty string. Do not include any other text or markdown formatting in the response.
      `;

      const result = await model.generateContent([
        prompt,
        {
          inlineData: {
            data: base64Image,
            mimeType: "image/jpeg",
          },
        },
      ]);

      const response = await result.response;
      const text = response.text();

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as RideDetails;
      }

      return null;
    } catch {
      return null;
    }
  }
};
