import { GoogleGenerativeAI } from "@google/generative-ai";
import TextRecognition from '@react-native-ml-kit/text-recognition';

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

  async parseRideScreenshot(base64Image: string, imageUri?: string): Promise<RideDetails | null> {
    lastOcrError = "";
    let mlKitRawText = "";

    // 1. Run local on-device ML Kit OCR to get raw text clues if available
    if (imageUri) {
      try {
        console.log("Extracting local on-device OCR text with ML Kit...");
        const result = await TextRecognition.recognize(imageUri);
        if (result && result.text) {
          mlKitRawText = result.text.trim();
          console.log("ML Kit text extracted:", mlKitRawText.slice(0, 150));
        }
      } catch (err) {
        console.warn("ML Kit on-device OCR error (will proceed with AI Vision):", err);
      }
    }

    const imageData = normalizeBase64Image(base64Image);

    // 2. Primary High-Accuracy Vision Extraction via Gemini Multimodal AI
    if (GEMINI_API_KEY && imageData && imageData.length >= 100) {
      console.log(`Starting AI OCR scan with ${imageData.length} bytes of image data...`);

      const modelsToTry = [
        "gemini-flash-latest",
        "gemini-3.8-flash",
        "gemini-3.6-flash",
        "gemini-3.5-flash-lite",
        "gemini-flash-lite-latest"
      ];
      const ATTEMPT_TIMEOUT_MS = 9000;

      function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
        return Promise.race([
          promise,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`OCR attempt timed out after ${ms}ms`)), ms)
          ),
        ]);
      }

      const prompt = `
        Analyze this Philippine ride-hailing / transport booking screenshot.
        Supported platforms: Grab, Move It, Joyride, Angkas, Maxim, InDrive.

        ${mlKitRawText ? `Recognized text from screenshot:\n"""\n${mlKitRawText}\n"""\n` : ''}

        Extract the following 5 fields accurately from the screenshot:
        1. driverName: The full name of the driver or rider (e.g., "Juan Dela Cruz", "Mark Alex").
           - DO NOT use UI text, status messages, or button labels (e.g. "Arriving in 3 mins", "Driver assigned", "Drop-off", "Pick-up point", "Cash", "Standard").
           - Look for the person's name near the driver avatar, profile card, or rating stars (e.g. 4.9 ★).
        2. plateNumber: The vehicle license plate or MV registration number (e.g., "ND 12345", "ABC 1234", "123-ABC", "4567 NM").
           - If not found, return "NONE".
        3. carModel: The specific vehicle make, model, or color (e.g., "Honda Click 125i", "Yamaha NMAX", "Toyota Vios Silver", "Yamaha Aerox", "Honda Beat", "Mitsubishi Mirage").
           - If not found, return "N/A".
        4. bookingType: The ride-hailing service name.
           - Must be one of: "Grab", "Joyride", "Move It", "Angkas", or "Other".
           - Grab: Green theme, GrabCar, GrabBike, GrabTaxi.
           - Move It: Red/Orange theme, Move It Biker / motorcycle taxi.
           - Joyride: Blue theme, JoyRide Super Taxi / MC Taxi.
           - Angkas: Blue/Turquoise theme, Angkas Biker.
        5. destinationName: The drop-off location or destination name. If not visible, return "Synced Ride".

        Return ONLY a raw JSON object with this exact schema (no markdown fences, no explanation):
        {
          "driverName": "string",
          "plateNumber": "string",
          "carModel": "string",
          "bookingType": "Grab" | "Joyride" | "Move It" | "Angkas" | "Other",
          "destinationName": "string"
        }
      `;

      let lastError: any = null;

      for (const modelName of modelsToTry) {
        // Attempt with REST API first (fastest and most reliable in React Native)
        try {
          console.log(`Attempting scan with REST model: ${modelName}...`);
          const parsed = await withTimeout(
            parseWithGeminiRest(modelName, prompt, imageData),
            ATTEMPT_TIMEOUT_MS
          );
          if (parsed && (parsed.driverName !== "N/A" || parsed.plateNumber !== "NONE" || parsed.bookingType !== "Other")) {
            console.log(`Extraction Successful through REST (${modelName})!`);
            return parsed;
          }
        } catch (error: any) {
          lastError = error;
          console.warn(`REST ${modelName} failed:`, error.message || error);
        }

        // Fallback to SDK attempt
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
          if (parsed && (parsed.driverName !== "N/A" || parsed.plateNumber !== "NONE" || parsed.bookingType !== "Other")) {
            console.log("Extraction Successful!");
            return parsed;
          }
        } catch (error: any) {
          lastError = error;
          console.warn(`SDK Model ${modelName} failed:`, error.message || error);
        }
      }

      if (lastError) {
        lastOcrError = getReadableOcrError(lastError);
      }
    }

    // 3. Smart Offline / Heuristic Fallback if Gemini is offline or unavailable
    if (mlKitRawText) {
      console.log("Using smart heuristic parser on ML Kit text as fallback...");
      const parsed = parseRawScreenText(mlKitRawText);
      if (parsed) {
        return parsed;
      }
    }

    if (!lastOcrError) {
      lastOcrError = "Could not read the ride details from this image. Please ensure the driver name, vehicle plate, and app are visible.";
    }
    return null;
  }
};

function parseRawScreenText(text: string): RideDetails | null {
  if (!text || text.trim().length === 0) return null;

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const textLower = text.toLowerCase();
  
  let bookingType: 'Grab' | 'Joyride' | 'Move It' | 'Angkas' | 'Other' = 'Other';
  if (textLower.includes('grab')) bookingType = 'Grab';
  else if (textLower.includes('joyride')) bookingType = 'Joyride';
  else if (textLower.includes('move it') || textLower.includes('moveit')) bookingType = 'Move It';
  else if (textLower.includes('angkas')) bookingType = 'Angkas';

  let plateNumber = 'NONE';
  let driverName = 'N/A';
  let carModel = 'N/A';

  // Philippine Plate Patterns: e.g. "ABC 1234", "1234 AB", "ND 12345", "ABC-123"
  const platePatterns = [
    /\b([A-Z]{2,3}[\s-]?[0-9]{3,4})\b/i,
    /\b([0-9]{4}[\s-]?[A-Z]{2,3})\b/i,
    /\b([A-Z]{2}[\s-]?[0-9]{4,5})\b/i,
  ];

  for (const line of lines) {
    if (plateNumber === 'NONE') {
      for (const pattern of platePatterns) {
        const match = line.match(pattern);
        if (match && !/total|peso|php|km|min|drop|pick/i.test(match[1])) {
          plateNumber = match[1].toUpperCase();
          break;
        }
      }
    }
  }

  // Common vehicle makes/models in the Philippines
  const vehicleKeywords = [
    'nmax', 'aerox', 'click', 'beat', 'mio', 'pcx', 'adv', 'wave', 'raider', 'sniper', 'barako', 'smash',
    'vios', 'mirage', 'wigo', 'avanza', 'innova', 'civic', 'city', 'almera', 'accent', 'yaris', 'fortuner'
  ];

  for (const line of lines) {
    if (carModel === 'N/A') {
      const lineLower = line.toLowerCase();
      if (vehicleKeywords.some(v => lineLower.includes(v))) {
        carModel = line;
      }
    }
  }

  // Filter out noise lines to detect driver name
  const noiseRegex = /grab|joyride|angkas|move\s*it|cancel|message|call|peso|php|total|payment|cash|drop-off|pickup|pick-up|arriving|min|km|booking|rating|share|emergency|safety|discount|promo|fare|driver/i;
  
  const possibleNames = lines.filter(l => {
    if (l === plateNumber || l === carModel) return false;
    if (l.length < 3 || l.length > 28) return false;
    if (noiseRegex.test(l)) return false;
    // Names usually consist of alphabetic words
    if (!/^[A-Za-z\s.'-]+$/.test(l)) return false;
    return true;
  });

  if (possibleNames.length > 0) {
    driverName = possibleNames[0];
  }

  return {
    driverName,
    plateNumber,
    carModel,
    bookingType,
    destinationName: 'Synced Ride',
    rawText: text
  };
}

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

  if (message.includes("timed out")) {
    return "The scan timed out due to a slow connection. Please try again.";
  }

  return "AI could not read the screenshot. Try a clearer screenshot with the driver, plate, vehicle, and destination visible.";
}
