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

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`OCR attempt timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export const OcrService = {
  getLastError() {
    return lastOcrError;
  },

  async parseRideScreenshot(base64Image: string, imageUri?: string): Promise<RideDetails | null> {
    lastOcrError = "";
    let mlKitRawText = "";

    // -------------------------------------------------------------
    // STAGE 1: Fast Local On-Device ML Kit OCR (~50-100ms)
    // -------------------------------------------------------------
    if (imageUri) {
      try {
        console.log("Stage 1: Extracting text locally with ML Kit...");
        const result = await TextRecognition.recognize(imageUri);
        if (result && result.text && result.text.trim().length > 0) {
          mlKitRawText = result.text.trim();
          console.log("ML Kit text extracted successfully:", mlKitRawText.slice(0, 120));
        }
      } catch (err) {
        console.warn("ML Kit local OCR skipped/failed:", err);
      }
    }

    // -------------------------------------------------------------
    // STAGE 2: Ultra-Fast AI Text-Only Parsing (~1 second!)
    // Sending ~1KB text payload over network instead of large image
    // -------------------------------------------------------------
    if (GEMINI_API_KEY && mlKitRawText.length >= 12) {
      const fastTextModels = [
        "gemini-2.0-flash",
        "gemini-1.5-flash",
        "gemini-1.5-flash-8b"
      ];
      const FAST_TEXT_TIMEOUT_MS = 4500;

      const textPrompt = `
        You are an expert parser for Philippine ride-hailing bookings (Grab, Move It, JoyRide, Angkas, Maxim).
        Analyze this OCR text extracted from a booking screenshot:
        """
        ${mlKitRawText}
        """

        CRITICAL IDENTIFICATION RULES:
        - MOVE IT: Motorcycle / 2-wheels (e.g. Yamaha NMAX, Aerox, Mio, Honda Click, Beat, PCX, ADV, Wave, Raider, Sniper, Barako, Smash), Move It Biker. (Note: Move It uses GrabMaps / Grab technology, but if it is a motorcycle / 2-wheels or mentions Move It, it is ALWAYS "Move It").
        - GRAB: Cars / 4-wheels / 6-seater / Sedan / SUV (e.g. Toyota Vios, Mirage, Innova, Avanza, Wigo, City, Civic, Almera, Accent, GrabCar, GrabTaxi).
        - JOYRIDE: JoyRide Super Taxi / MC Taxi / JoyRide Biker, Blue theme.
        - ANGKAS: Angkas Biker, Blue/Turquoise theme.

        ACCURATE FIELD EXTRACTION RULES:
        1. driverName: Full human name of the assigned driver / rider / biker (e.g. "Juan Dela Cruz", "Eduardo Santos").
           - NEVER include ratings (e.g. 5.0, 4.95, ★), time, or status messages.
           - Strip prefixes like "Driver:", "Rider:", "Biker:".
           - If not found or only generic UI text, return "N/A".
        2. plateNumber: License plate or MV file registration number (e.g. "ABC 1234", "ND 12345", "123-ABC", "1234 AB", "1301-1234567").
           - Strip labels like "Plate:", "Plate No:", "MV File:".
           - If not found, return "NONE".
        3. carModel: Vehicle make/model/color (e.g. "Honda Click 125i", "Yamaha NMAX", "Toyota Vios Silver"). If not found, use "N/A".
        4. bookingType: "Grab" | "Joyride" | "Move It" | "Angkas" | "Other".
        5. destinationName: The destination / drop-off name. If not found, use "Synced Ride".

        Return ONLY a raw JSON object (no explanation, no markdown):
        {
          "driverName": "string",
          "plateNumber": "string",
          "carModel": "string",
          "bookingType": "Grab" | "Joyride" | "Move It" | "Angkas" | "Other",
          "destinationName": "string"
        }
      `;

      for (const modelName of fastTextModels) {
        try {
          console.log(`Stage 2: Parsing text with fast AI model: ${modelName}...`);
          const parsed = await withTimeout(
            parseWithGeminiText(modelName, textPrompt),
            FAST_TEXT_TIMEOUT_MS
          );
          if (parsed && (parsed.driverName !== "N/A" || parsed.plateNumber !== "NONE" || parsed.bookingType !== "Other")) {
            console.log(`Stage 2 SUCCESS: Parsed in record time with ${modelName}!`);
            parsed.rawText = mlKitRawText;
            return parsed;
          }
        } catch (error: any) {
          console.warn(`Fast text parse with ${modelName} failed:`, error.message || error);
        }
      }
    }

    // -------------------------------------------------------------
    // STAGE 3: Fallback Multimodal AI Vision (If ML Kit found no text)
    // -------------------------------------------------------------
    const imageData = normalizeBase64Image(base64Image);
    if (GEMINI_API_KEY && imageData && imageData.length >= 100) {
      console.log("Stage 3: Running Multimodal Vision AI scan on image data...");

      const visionModels = [
        "gemini-2.0-flash",
        "gemini-1.5-flash"
      ];
      const VISION_TIMEOUT_MS = 6000;

      const visionPrompt = `
        Analyze this Philippine ride-hailing / transport booking screenshot.
        Supported platforms: Grab, Move It, Joyride, Angkas, Maxim, InDrive.

        CRITICAL RULES:
        - MOVE IT: Motorcycle taxi / 2-wheels (e.g. Honda Click, Yamaha NMAX, Aerox, Mio, Beat), Red/Orange theme, Move It Biker. (Move It uses GrabMaps, but if the vehicle is a motorcycle or red/orange, it is MOVE IT).
        - GRAB: Car / 4-wheels / 6-seater / Sedan (e.g. Toyota Vios, Mitsubishi Mirage, Innova), Green theme, GrabCar.
        - JOYRIDE: Blue theme, JoyRide Super Taxi / MC Taxi.
        - ANGKAS: Blue/Turquoise theme, Angkas Biker.

        Extract the following 5 fields accurately from the screenshot:
        1. driverName: Full name of the driver or rider (e.g. "Juan Dela Cruz"). Look near the driver avatar/rating. Strip ratings or labels. If not found, use "N/A".
        2. plateNumber: Vehicle plate or registration number (e.g. "ND 12345", "ABC 1234", "123-ABC", "1234 AB"). If none, "NONE".
        3. carModel: Vehicle make/model/color (e.g. "Honda Click 125i", "Yamaha NMAX", "Toyota Vios"). If none, "N/A".
        4. bookingType: "Grab" | "Joyride" | "Move It" | "Angkas" | "Other".
        5. destinationName: Drop-off destination name. If none, "Synced Ride".

        Return ONLY a JSON object:
        {
          "driverName": "string",
          "plateNumber": "string",
          "carModel": "string",
          "bookingType": "Grab" | "Joyride" | "Move It" | "Angkas" | "Other",
          "destinationName": "string"
        }
      `;

      let lastError: any = null;
      for (const modelName of visionModels) {
        try {
          console.log(`Stage 3: Attempting Vision scan with ${modelName}...`);
          const parsed = await withTimeout(
            parseWithGeminiVision(modelName, visionPrompt, imageData),
            VISION_TIMEOUT_MS
          );
          if (parsed && (parsed.driverName !== "N/A" || parsed.plateNumber !== "NONE" || parsed.bookingType !== "Other")) {
            console.log(`Stage 3 SUCCESS through Vision (${modelName})!`);
            return parsed;
          }
        } catch (error: any) {
          lastError = error;
          console.warn(`Vision ${modelName} failed:`, error.message || error);
        }
      }

      if (lastError) {
        lastOcrError = getReadableOcrError(lastError);
      }
    }

    // -------------------------------------------------------------
    // STAGE 4: Instant Offline Heuristic Fallback (0ms, no network)
    // -------------------------------------------------------------
    if (mlKitRawText) {
      console.log("Stage 4: Using instant offline regex parser on ML Kit text...");
      const parsed = parseRawScreenText(mlKitRawText);
      if (parsed) {
        return parsed;
      }
    }

    if (!lastOcrError) {
      lastOcrError = "Could not read the ride details from this image. Please ensure the driver name and plate are clearly visible.";
    }
    return null;
  }
};

/**
 * Clean and normalize driver name
 */
function cleanDriverName(raw?: string): string {
  if (!raw) return "N/A";
  let cleaned = String(raw).trim();
  cleaned = cleaned.replace(/^["']|["']$/g, "").trim();
  cleaned = cleaned.replace(/(?:★|\*|\b[0-5]\.\d{1,2}\b|\([0-5]\.\d{1,2}\))/g, "").trim();
  cleaned = cleaned.replace(/^(?:driver|rider|biker|captain|kuya|mr\.?|ms\.?)[:\s-]+/i, "").trim();
  cleaned = cleaned.replace(/^[-,.:\s]+|[-,.:\s]+$/g, "").trim();
  
  if (
    !cleaned ||
    cleaned.length < 2 ||
    /^(?:none|n\/a|null|undefined|na|driver|rider|biker|arriving|dropoff|pickup|destination|cash|booking)$/i.test(cleaned)
  ) {
    return "N/A";
  }
  return cleaned;
}

/**
 * Clean and normalize plate number
 */
function cleanPlateNumber(raw?: string): string {
  if (!raw) return "NONE";
  let cleaned = String(raw).trim().toUpperCase();
  cleaned = cleaned.replace(/^["']|["']$/g, "").trim();
  cleaned = cleaned.replace(/^(?:PLATE\s*NO\.?|PLATE\s*NUMBER|PLATE|MV\s*FILE\s*NO\.?|MV\s*FILE|REG\s*NO\.?|MV)[:\s-]+/i, "").trim();
  cleaned = cleaned.replace(/^[-,.:\s]+|[-,.:\s]+$/g, "").trim();

  if (
    !cleaned ||
    /^(?:NONE|N\/A|NULL|UNDEFINED|NA|UNKNOWN|PLATE)$/i.test(cleaned) ||
    cleaned.length < 3
  ) {
    return "NONE";
  }
  return cleaned;
}

/**
 * Fast Text-only AI request via REST (Sends only ~1KB text, finishes in ~1s)
 */
async function parseWithGeminiText(modelName: string, prompt: string): Promise<RideDetails | null> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      }),
    }
  );

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || `HTTP ${response.status}`);
  }

  const text = payload?.candidates?.[0]?.content?.parts
    ?.map((part: any) => part.text)
    .filter(Boolean)
    .join("\n") || "";

  return extractRideDetailsFromText(text);
}

/**
 * Multimodal AI request via REST (Sends image + prompt)
 */
async function parseWithGeminiVision(modelName: string, prompt: string, imageData: string): Promise<RideDetails | null> {
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
    throw new Error(payload?.error?.message || `HTTP ${response.status}`);
  }

  const text = payload?.candidates?.[0]?.content?.parts
    ?.map((part: any) => part.text)
    .filter(Boolean)
    .join("\n") || "";

  return extractRideDetailsFromText(text);
}

function parseRawScreenText(text: string): RideDetails | null {
  if (!text || text.trim().length === 0) return null;

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const textLower = text.toLowerCase();
  
  let plateNumber = 'NONE';
  let driverName = 'N/A';
  let carModel = 'N/A';

  // Philippine Plate Patterns: e.g. "ABC 1234", "1234 AB", "ND 12345", "123-ABC", "1301-1234567"
  const platePatterns = [
    /(?:plate|plate\s*no|plateno|mv\s*file)[:\s]*([A-Z0-9\s-]{4,15})/i,
    /\b(1301-[0-9]{6,10})\b/i,
    /\b([A-Z]{2,3}[\s-]?[0-9]{3,4})\b/i,
    /\b([0-9]{4}[\s-]?[A-Z]{2,3})\b/i,
    /\b([A-Z]{2}[\s-]?[0-9]{4,5})\b/i,
    /\b([0-9]{3}[\s-]?[A-Z]{3})\b/i,
  ];

  for (const line of lines) {
    if (plateNumber === 'NONE') {
      for (const pattern of platePatterns) {
        const match = line.match(pattern);
        if (match && !/total|peso|php|km|min|drop|pick|order|cash|fare/i.test(match[1])) {
          const candidate = cleanPlateNumber(match[1]);
          if (candidate !== 'NONE') {
            plateNumber = candidate;
            break;
          }
        }
      }
    }
  }

  // Common vehicle makes/models in the Philippines
  const motorcycleKeywords = [
    'nmax', 'aerox', 'click', 'beat', 'mio', 'pcx', 'adv', 'wave', 'raider', 'sniper', 'barako', 'smash', 'motorcycle', 'motor'
  ];
  const carKeywords = [
    'vios', 'mirage', 'wigo', 'avanza', 'innova', 'civic', 'city', 'almera', 'accent', 'yaris', 'fortuner', 'sedan', 'grabcar'
  ];

  let isMotorcycle = false;
  for (const line of lines) {
    if (carModel === 'N/A') {
      const lineLower = line.toLowerCase();
      if (motorcycleKeywords.some(v => lineLower.includes(v))) {
        carModel = line;
        isMotorcycle = true;
      } else if (carKeywords.some(v => lineLower.includes(v))) {
        carModel = line;
      }
    }
  }

  // Booking Type Identification (Move It = Motorcycle, Grab = Car)
  let bookingType: 'Grab' | 'Joyride' | 'Move It' | 'Angkas' | 'Other' = 'Other';
  if (textLower.includes('move it') || textLower.includes('moveit') || (isMotorcycle && !textLower.includes('joyride') && !textLower.includes('angkas'))) {
    bookingType = 'Move It';
  } else if (textLower.includes('joyride')) {
    bookingType = 'Joyride';
  } else if (textLower.includes('angkas')) {
    bookingType = 'Angkas';
  } else if (textLower.includes('grab') || !isMotorcycle) {
    bookingType = 'Grab';
  }

  // Filter out noise lines to detect driver name
  const noiseRegex = /grab|joyride|angkas|move\s*it|cancel|message|call|peso|php|total|payment|cash|drop-off|pickup|pick-up|arriving|min|km|booking|rating|share|emergency|safety|discount|promo|fare|driver|rider|biker|destination|arriving in|your driver/i;
  
  const possibleNames = lines.filter(l => {
    if (l === plateNumber || l === carModel) return false;
    if (l.length < 3 || l.length > 28) return false;
    if (noiseRegex.test(l)) return false;
    if (!/^[A-Za-z\s.'-]+$/.test(l)) return false;
    return true;
  });

  if (possibleNames.length > 0) {
    driverName = cleanDriverName(possibleNames[0]);
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

      if (rawDriver) driverName = cleanDriverName(rawDriver);
      if (rawPlate) plateNumber = cleanPlateNumber(rawPlate);
      if (rawModel && String(rawModel).trim().length > 0) carModel = String(rawModel).trim();
      if (rawDest && String(rawDest).trim().length > 0) destinationName = String(rawDest).trim();

      if (rawType) {
        const typeStr = String(rawType).toLowerCase();
        if (typeStr.includes('move it') || typeStr.includes('moveit')) bookingType = 'Move It';
        else if (typeStr.includes('grab')) bookingType = 'Grab';
        else if (typeStr.includes('joyride')) bookingType = 'Joyride';
        else if (typeStr.includes('angkas')) bookingType = 'Angkas';
        else bookingType = 'Other';
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
  if (fullTextLower.includes('move it') || fullTextLower.includes('moveit')) bookingType = 'Move It';
  else if (fullTextLower.includes('grab')) bookingType = 'Grab';
  else if (fullTextLower.includes('joyride')) bookingType = 'Joyride';
  else if (fullTextLower.includes('angkas')) bookingType = 'Angkas';

  return {
    driverName: cleanDriverName(driverMatch?.[1]),
    plateNumber: cleanPlateNumber(plateMatch?.[1]),
    carModel: modelMatch?.[1]?.trim() || "N/A",
    bookingType,
    destinationName: destMatch?.[1]?.trim() || "Synced Ride",
    rawText: text,
  };
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
