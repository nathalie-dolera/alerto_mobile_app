import { GoogleGenerativeAI } from "@google/generative-ai";

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
let lastOcrError = "";

function normalizeBase64Image(base64Image: string) {
  return base64Image.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "").trim();
}

export interface RideDetails {
  driverName: string;
  plateNumber: string;
  bookingType: 'Grab' | 'Joyride' | 'Move It' | 'Angkas' | 'Other';
  carModel: string;
  destinationName?: string;
  rawText?: string;
}

export const OcrService = {
  getLastError() {
    return lastOcrError;
  },

  async parseRideScreenshot(base64Image: string): Promise<RideDetails | null> {
    lastOcrError = "";

    if (!GEMINI_API_KEY) {
      lastOcrError = "Missing Gemini API key. Add EXPO_PUBLIC_GEMINI_API_KEY to your .env and restart Expo.";
      console.error("OCR Error:", lastOcrError);
      return null;
    }

    const imageData = normalizeBase64Image(base64Image);

    if (!imageData || imageData.length < 100) {
      lastOcrError = "The selected screenshot did not provide readable image data.";
      console.error("OCR Error:", lastOcrError);
      return null;
    }

    console.log(`Starting OCR scan with ${imageData.length} bytes of image data...`);

    const modelsToTry = [
      "gemini-flash-latest",
      "gemini-1.5-flash"
    ];
    let lastError: any = null;

    const prompt = `
      Analyze this transport booking screenshot (Grab, Joyride, Move It, Angkas, etc.).
      You must extract the following 5 fields:
      1. driverName: The full name of the driver.
      2. plateNumber: The vehicle plate number. If not clearly found, use "NONE".
      3. carModel: The model or brand of the vehicle (e.g., Honda Civic, Toyota Vios, etc.).
      4. bookingType: Identify if it is "Grab", "Joyride", "Move It", "Angkas", or "Other".
      5. destinationName: The drop-off location or destination name found in the screenshot. If none found, use "Synced Ride".

      CRITICAL IDENTIFICATION RULES:
      - CAR = Grab
      - MOTORCYCLE = Move It (unless rules below apply)
      - MOTORCYCLE + "biker" = Angkas
      - MOTORCYCLE + "MC Taxi" = Joyride
      - Ignore "GrabMaps" and Grab ads as they appear in both.
      - If a field is partly hidden or unreadable, use "N/A" instead of failing.
      - If the plate number is not visible, use "NONE".
      - If the destination is not visible, use "Synced Ride".

      Return ONLY a JSON object. No other text.
      {
        "driverName": "string",
        "plateNumber": "string",
        "carModel": "string",
        "bookingType": "Grab" | "Joyride" | "Move It" | "Angkas" | "Other",
        "destinationName": "string"
      }
    `;

    for (const modelName of modelsToTry) {
      try {
        console.log(`Attempting scan with model: ${modelName}...`);
        const model = genAI.getGenerativeModel(
          {
            model: modelName,
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.1,
            },
          },
          { apiVersion: 'v1' }
        );

        const mimeType = imageData.startsWith('iVBORw0KGgo') ? "image/png" : "image/jpeg";
        const result = await model.generateContent([
          prompt,
          {
            inlineData: {
              data: imageData,
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
          parsed.driverName = parsed.driverName || "N/A";
          parsed.plateNumber = parsed.plateNumber || "NONE";
          parsed.carModel = parsed.carModel || "N/A";
          parsed.destinationName = parsed.destinationName || "Synced Ride";
          parsed.bookingType = parsed.bookingType || "Other";
          console.log("Extraction Successful!");
          return parsed;
        }
      } catch (error: any) {
        lastError = error;
        console.warn(`Model ${modelName} failed:`, error.message || error);
      }

      try {
        const parsed = await parseWithGeminiRest(modelName, prompt, imageData);
        if (parsed) {
          console.log(`Extraction Successful through REST fallback (${modelName})!`);
          return parsed;
        }
      } catch (error: any) {
        lastError = error;
        console.warn(`REST fallback ${modelName} failed:`, error.message || error);
      }
    }

    lastOcrError = getReadableOcrError(lastError);
    console.error("OCR Service Failure: All models failed or returned invalid data.", lastError);
    return null;
  }
};

async function parseWithGeminiRest(modelName: string, prompt: string, imageData: string): Promise<RideDetails | null> {
  const mimeType = imageData.startsWith('iVBORw0KGgo') ? "image/png" : "image/jpeg";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { mimeType, data: imageData } },
          ],
        }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      }),
    }
  );

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Gemini HTTP ${response.status}`);
  }

  const text = payload?.candidates?.[0]?.content?.parts
    ?.map((part: any) => part.text)
    .filter(Boolean)
    .join("\n") || "";
  const jsonMatch = text.replace(/```json|```/g, "").trim().match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    return null;
  }

  const parsed = JSON.parse(jsonMatch[0]) as RideDetails;
  parsed.driverName = parsed.driverName || "N/A";
  parsed.plateNumber = parsed.plateNumber || "NONE";
  parsed.carModel = parsed.carModel || "N/A";
  parsed.destinationName = parsed.destinationName || "Synced Ride";
  parsed.bookingType = parsed.bookingType || "Other";
  return parsed;
}

function getReadableOcrError(error: any) {
  const message = String(error?.message || error || "");

  if (message.includes("API key") || message.includes("API_KEY_INVALID")) {
    return "Gemini API key is missing or invalid.";
  }

  if (message.includes("429") || message.toLowerCase().includes("quota")) {
    return "Gemini OCR quota was reached. Please try again later.";
  }

  if (message.includes("403")) {
    return "Gemini OCR is not allowed for this API key.";
  }

  if (message.includes("Network request failed") || message.includes("Failed to fetch")) {
    return "Network connection failed while reading the screenshot.";
  }

  return "AI could not read the screenshot. Try a clearer screenshot with the driver, plate, vehicle, and destination visible.";
}
