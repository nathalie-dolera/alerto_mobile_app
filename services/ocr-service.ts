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
      "gemini-2.5-flash",
      "gemini-3.1-flash-lite",
      "gemini-3.5-flash",
      "gemini-3.5-flash-lite",
      "gemini-3.6-flash",
      "gemini-3.7-flash",
      "gemini-1.5-flash",
      "gemini-2.0-flash",
      "gemini-flash-latest",
    ];
    let lastError: any = null;

    const ATTEMPT_TIMEOUT_MS = 10000;

    function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
      return Promise.race([
        promise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`OCR attempt timed out after ${ms}ms`)), ms)
        ),
      ]);
    }

    const prompt = `
      Analyze this transport booking screenshot (Grab, Joyride, Move It, Angkas, etc.).
      You must extract the following 5 fields:
      1. driverName: The full name of the driver. If unreadable, use "N/A".
      2. plateNumber: The vehicle plate number. If not clearly found, use "NONE".
      3. carModel: The model or brand of the vehicle (e.g., Honda Civic, Toyota Vios, Yamaha NMAX, etc.). If unreadable, use "N/A".
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
      // 1. Attempt with REST API first (fastest and most reliable in React Native)
      try {
        console.log(`Attempting scan with REST model: ${modelName}...`);
        const parsed = await withTimeout(
          parseWithGeminiRest(modelName, prompt, imageData),
          ATTEMPT_TIMEOUT_MS
        );
        if (parsed) {
          console.log(`Extraction Successful through REST (${modelName})!`);
          return parsed;
        }
      } catch (error: any) {
        lastError = error;
        console.warn(`REST ${modelName} failed:`, error.message || error);
      }

      // 2. Fallback to SDK attempt
      try {
        console.log(`Attempting scan with SDK model: ${modelName}...`);
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        });

        const mimeType = imageData.startsWith('iVBORw0KGgo') ? "image/png" : "image/jpeg";
        const result = await withTimeout(
          model.generateContent([
            prompt,
            { inlineData: { data: imageData, mimeType } },
          ]),
          ATTEMPT_TIMEOUT_MS
        );

        const response = await result.response;
        const text = response.text();
        console.log(`AI Response (${modelName}):`, text);

        const parsed = extractRideDetailsFromText(text);
        if (parsed) {
          console.log("Extraction Successful!");
          return parsed;
        }
      } catch (error: any) {
        lastError = error;
        console.warn(`SDK Model ${modelName} failed:`, error.message || error);
      }
    }

    lastOcrError = getReadableOcrError(lastError);
    console.error("OCR Service Failure: All models failed or returned invalid data.", lastError);
    return null;
  }
};

function extractRideDetailsFromText(text: string): RideDetails | null {
  if (!text || text.trim().length === 0) return null;

  let driverName = "N/A";
  let plateNumber = "NONE";
  let carModel = "N/A";
  let bookingType: 'Grab' | 'Joyride' | 'Move It' | 'Angkas' | 'Other' = 'Other';
  let destinationName = "Synced Ride";

  try {
    const cleanJson = text.replace(/```json|```/g, "").trim();
    const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, any>;

      const rawDriver = parsed.driverName || parsed.driver_name || parsed.driver || parsed.driverNameText || parsed.driver_info;
      const rawPlate = parsed.plateNumber || parsed.plate_number || parsed.plate || parsed.plateNo || parsed.vehicle_plate;
      const rawModel = parsed.carModel || parsed.car_model || parsed.vehicle || parsed.vehicleModel || parsed.car;
      const rawType = parsed.bookingType || parsed.booking_type || parsed.app || parsed.type || parsed.service;
      const rawDest = parsed.destinationName || parsed.destination_name || parsed.destination || parsed.dropoff || parsed.to;

      if (rawDriver && String(rawDriver).trim().length > 0) driverName = String(rawDriver).trim();
      if (rawPlate && String(rawPlate).trim().length > 0) plateNumber = String(rawPlate).trim();
      if (rawModel && String(rawModel).trim().length > 0) carModel = String(rawModel).trim();
      if (rawDest && String(rawDest).trim().length > 0) destinationName = String(rawDest).trim();

      if (rawType) {
        const typeStr = String(rawType).toLowerCase();
        if (typeStr.includes('grab')) bookingType = 'Grab';
        else if (typeStr.includes('joyride')) bookingType = 'Joyride';
        else if (typeStr.includes('move it') || typeStr.includes('moveit')) bookingType = 'Move It';
        else if (typeStr.includes('angkas')) bookingType = 'Angkas';
        else bookingType = 'Other';
      } else {
        const fullTextLower = text.toLowerCase();
        if (fullTextLower.includes('grab')) bookingType = 'Grab';
        else if (fullTextLower.includes('joyride')) bookingType = 'Joyride';
        else if (fullTextLower.includes('move it') || fullTextLower.includes('moveit')) bookingType = 'Move It';
        else if (fullTextLower.includes('angkas')) bookingType = 'Angkas';
      }

      return {
        driverName: driverName || "N/A",
        plateNumber: plateNumber || "NONE",
        carModel: carModel || "N/A",
        bookingType,
        destinationName: destinationName || "Synced Ride",
        rawText: text,
      };
    }
  } catch {
    // Fall back to regex parsing below if JSON syntax parse fails
  }

  // Regex parsing fallback
  const driverMatch = text.match(/(?:driverName|driver_name|driver)[:\s]+"?([^\n",]+)"?/i);
  const plateMatch = text.match(/(?:plateNumber|plate_number|plate)[:\s]+"?([^\n",]+)"?/i);
  const modelMatch = text.match(/(?:carModel|car_model|vehicle)[:\s]+"?([^\n",]+)"?/i);
  const destMatch = text.match(/(?:destinationName|destination)[:\s]+"?([^\n",]+)"?/i);
  const typeMatch = text.match(/(?:bookingType|booking_type|app)[:\s]+"?([^\n",]+)"?/i);

  const fullTextLower = text.toLowerCase();
  if (fullTextLower.includes('grab')) bookingType = 'Grab';
  else if (fullTextLower.includes('joyride')) bookingType = 'Joyride';
  else if (fullTextLower.includes('move it') || fullTextLower.includes('moveit')) bookingType = 'Move It';
  else if (fullTextLower.includes('angkas')) bookingType = 'Angkas';

  return {
    driverName: driverMatch?.[1]?.trim() || "N/A",
    plateNumber: plateMatch?.[1]?.trim() || "NONE",
    carModel: modelMatch?.[1]?.trim() || "N/A",
    bookingType,
    destinationName: destMatch?.[1]?.trim() || "Synced Ride",
    rawText: text,
  };
}

async function parseWithGeminiRest(modelName: string, prompt: string, imageData: string): Promise<RideDetails | null> {
  const mimeType = imageData.startsWith('iVBORw0KGgo') ? "image/png" : "image/jpeg";
  
  // 1. Try with responseMimeType: "application/json"
  try {
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
    if (response.ok) {
      const text = payload?.candidates?.[0]?.content?.parts
        ?.map((part: any) => part.text)
        .filter(Boolean)
        .join("\n") || "";

      const parsed = extractRideDetailsFromText(text);
      if (parsed) return parsed;
    }
  } catch {
    // Ignore and proceed to standard fallback
  }

  // 2. Fallback REST request without responseMimeType constraint
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

  return extractRideDetailsFromText(text);
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
