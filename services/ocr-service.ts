import { GoogleGenerativeAI } from "@google/generative-ai";

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

export interface RideDetails {
  driverName: string;
  plateNumber: string;
  bookingType: 'Grab' | 'Joyride' | 'Move It' | 'Angkas' | 'Other';
  carModel: string;
  rawText?: string;
}

export const OcrService = {
  async parseRideScreenshot(base64Image: string): Promise<RideDetails | null> {
    if (!GEMINI_API_KEY) {
      console.error("OCR Error: GEMINI_API_KEY is missing.");
      return null;
    }

    if (!base64Image || base64Image.length < 100) {
      console.error("OCR Error: Invalid or empty base64 image data.");
      return null;
    }

    console.log(`Starting OCR scan with ${base64Image.length} bytes of image data...`);

    const modelsToTry = [
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemini-2.0-flash-lite",
      "gemini-2.0-flash",
      "gemini-2.5-pro"
    ];
    let lastError = null;

    for (const modelName of modelsToTry) {
      try {
        console.log(`Attempting scan with model: ${modelName}...`);
        const model = genAI.getGenerativeModel(
          { model: modelName },
          { apiVersion: 'v1' }
        );

        const prompt = `
          Analyze this transport booking screenshot (Grab, Joyride, Move It, Angkas, etc.).
          You must extract the following 4 fields:
          1. driverName: The full name of the driver.
          2. plateNumber: The vehicle plate number. If not clearly found, use "NONE".
          3. carModel: The model or brand of the vehicle (e.g., Honda Civic, Toyota Vios, etc.).
          4. bookingType: Identify if it is "Grab", "Joyride", "Move It", "Angkas", or "Other".

          CRITICAL IDENTIFICATION RULES:
          - CAR = Grab
          - MOTORCYCLE = Move It (unless rules below apply)
          - MOTORCYCLE + "biker" = Angkas
          - MOTORCYCLE + "MC Taxi" = Joyride
          - Ignore "GrabMaps" and Grab ads as they appear in both.

          Return ONLY a JSON object. No other text.
          {
            "driverName": "string",
            "plateNumber": "string",
            "carModel": "string",
            "bookingType": "Grab" | "Joyride" | "Move It" | "Angkas" | "Other"
          }
        `;

        const mimeType = base64Image.startsWith('iVBORw0KGgo') ? "image/png" : "image/jpeg";
        const result = await model.generateContent([
          prompt,
          {
            inlineData: {
              data: base64Image,
              mimeType: mimeType,
            },
          },
        ]);

        const response = await result.response;
        const text = response.text();
        console.log(`AI Response (${modelName}):`, text);

        const cleanJson = text.replace(/```json|```/g, "").trim();
        const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as RideDetails;
          console.log("Extraction Successful!");
          return parsed;
        }
      } catch (error: any) {
        lastError = error;
        console.warn(`Model ${modelName} failed:`, error.message || error);

        //if 429/503, try the next model
        if (error.message?.includes("429") || error.message?.includes("503") || error.message?.includes("quota")) {
          continue;
        }

        continue;
      }
    }

    console.error("OCR Service Failure: All models failed or returned invalid data.", lastError);
    return null;
  }
};
